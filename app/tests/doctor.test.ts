import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setDefaultTimeout } from 'bun:test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDoctor, projectRoot, runDoctor } from '../../bin/lib/doctor.mjs'

setDefaultTimeout(30_000)

const ENV = ['IRSIM_ROOT', 'IRSIM_DESIGN_DIR', 'CANVAS_DESIGN_DIR'] as const

let base = ''
let saved: (string | undefined)[] = []

const env = (): NodeJS.ProcessEnv => process.env

const write = (file: string, body: string): void => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, body)
}

/** The managed block the doctor compares against, so a passing project holds the real template. */
const managed = (): string => readFileSync(join(import.meta.dirname, '..', '..', 'templates', 'agents-block.md'), 'utf8').trim()

const board = (name: string, title = name): string =>
  `<!doctype html><html><head><title>${title}</title></head><body><x-dc></x-dc><script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":100,"height":50}}'></script></body></html>`

/** A project that passes every check, so a case can break exactly one thing. */
const project = (): string => {
  write(join(base, '.irsim.json'), '{"designDir":"design"}\n')
  write(join(base, '.gitignore'), '.irsim/\n')
  write(join(base, '.gitattributes'), 'design/*.dc.html linguist-generated=true\n')
  write(join(base, '.github/copilot-instructions.md'), 'x\n')
  write(join(base, '.coderabbit.yaml'), 'x\n')
  write(join(base, 'AGENTS.md'), `${managed()}\n`)
  write(join(base, 'design/CanvasApp.dc.html'), board('CanvasApp'))
  write(
    join(base, 'design/canvas.json'),
    JSON.stringify({ version: 1, pages: [{ id: 'p', title: 'P', boards: [{ name: 'CanvasApp' }] }] }),
  )
  execFileSync('git', ['init', '-q'], { cwd: base })
  return base
}

const find = (report: { checks: { id: string; status: string; detail: string; fix?: string }[] }, id: string) =>
  report.checks.find((one) => one.id === id)

beforeEach(() => {
  saved = ENV.map((name) => process.env[name])
  ENV.forEach((name) => delete process.env[name])
  base = mkdtempSync(join(tmpdir(), 'irsim-doctor-'))
})

afterEach(() => {
  ENV.forEach((name, at) => {
    const value = saved[at]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  })
  rmSync(base, { recursive: true, force: true })
})

describe('doctor', () => {
  it('passes a project that has the config, the rules and the review setup', async () => {
    project()
    write(join(base, 'CLAUDE.md'), '')
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.ok).toBe(true)
    expect(find(report, 'config-file')?.detail).toBe('designDir design')
    expect(find(report, 'design-dir')?.detail).toBe('design, 1 boards')
    expect(find(report, 'board-files')?.status).toBe('ok')
    expect(find(report, 'gitignore')?.status).toBe('ok')
  })

  it('fails without .irsim.json and names irsim init', async () => {
    project()
    rmSync(join(base, '.irsim.json'))
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.ok).toBe(false)
    expect(find(report, 'config-file')).toMatchObject({ status: 'fail', fix: 'irsim init' })
  })

  it('reports no commit yet as a warning rather than a failure', async () => {
    project()
    const report = await runDoctor({ cwd: base, env: env() })
    expect(report.ok).toBe(true)
    expect(find(report, 'git-branch')).toMatchObject({ status: 'warn', detail: 'no commit yet' })
  })

  it('keeps a missing CLAUDE.md quiet but warns on a missing AGENTS.md', async () => {
    project()
    const report = await runDoctor({ cwd: base, env: env() })
    expect(find(report, 'claude-block')).toMatchObject({ status: 'ok' })
    expect(find(report, 'agents-block')).toMatchObject({ status: 'ok' })

    rmSync(join(base, 'AGENTS.md'))
    const next = await runDoctor({ cwd: base, env: env() })
    expect(find(next, 'agents-block')?.status).toBe('warn')
  })

  it('warns when a managed block is missing or out of date', async () => {
    project()
    write(join(base, 'AGENTS.md'), 'no block here\n')
    expect(find(await runDoctor({ cwd: base, env: env() }), 'agents-block')).toMatchObject({
      status: 'warn',
      detail: 'no managed block',
    })

    write(join(base, 'AGENTS.md'), '<!-- IRSIM_START -->\nold\n<!-- IRSIM_END -->\n')
    expect(find(await runDoctor({ cwd: base, env: env() }), 'agents-block')).toMatchObject({
      status: 'warn',
      fix: 'irsim init --refresh-block',
    })
  })

  it('fails a canvas.json that names a board with no file', async () => {
    project()
    write(
      join(base, 'design/canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [{ id: 'p', title: 'P', boards: [{ name: 'CanvasApp' }, { name: 'Gone' }] }],
      }),
    )
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.ok).toBe(false)
    expect(find(report, 'board-files')).toMatchObject({ status: 'fail', fix: 'irsim build' })
    expect(find(report, 'board-files')?.detail).toContain('Gone')
  })

  it('fails a canvas.json that is not valid JSON', async () => {
    project()
    write(join(base, 'design/canvas.json'), '{broken')
    expect(find(await runDoctor({ cwd: base, env: env() }), 'canvas-json')).toMatchObject({
      status: 'fail',
      fix: 'irsim build',
    })
  })

  it('warns on a missing review setup and never fails on it', async () => {
    project()
    rmSync(join(base, '.coderabbit.yaml'))
    rmSync(join(base, '.github/copilot-instructions.md'))
    rmSync(join(base, '.gitattributes'))
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.ok).toBe(true)
    for (const id of ['review-coderabbit', 'review-copilot', 'collapse-board-diffs'])
      expect(find(report, id)?.status).toBe('warn')
  })

  it('reports the branch, the remote and the uncommitted count as context', async () => {
    project()
    execFileSync('git', ['-C', base, 'remote', 'add', 'origin', 'git@github.com:owner/repo.git'])
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.context.repo).toBe('owner/repo')
    expect(report.context.remote).toBe('git@github.com:owner/repo.git')
    expect(report.context.dirty).toBeGreaterThan(0)
    expect(report.context.detached).toBe(false)
    expect(find(report, 'git-repo')?.status).toBe('ok')
  })

  it('warns on a detached HEAD and on no remote', async () => {
    project()
    execFileSync('git', ['-C', base, 'add', '.'])
    execFileSync('git', ['-C', base, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'one'])
    execFileSync('git', ['-C', base, 'checkout', '-q', '--detach'])
    const report = await runDoctor({ cwd: base, env: env() })

    expect(report.context.detached).toBe(true)
    expect(find(report, 'git-branch')?.status).toBe('warn')
    expect(find(report, 'git-remote')?.status).toBe('warn')
  })

  it('skips the canvas check when the project is not serving', async () => {
    project()
    const report = await runDoctor({ cwd: base, env: env() })
    expect(find(report, 'canvas')).toMatchObject({ status: 'skip' })
  })
})

describe('projectRoot', () => {
  it('prefers IRSIM_ROOT', () => {
    expect(projectRoot(base, { IRSIM_ROOT: '/forced' } as NodeJS.ProcessEnv)).toBe('/forced')
  })

  it('is the folder with .irsim.json above cwd', () => {
    project()
    mkdirSync(join(base, 'deep/nested'), { recursive: true })
    expect(projectRoot(join(base, 'deep/nested'), {} as NodeJS.ProcessEnv)).toBe(base)
  })
})

describe('formatDoctor', () => {
  it('groups the checks and prints one summary line with the fix indented', () => {
    const text = formatDoctor({
      ok: false,
      summary: { ok: 1, warn: 0, fail: 1, skip: 0 },
      checks: [
        { id: 'a', group: 'config', title: 'config a', status: 'ok', detail: 'fine' },
        { id: 'b', group: 'git', title: 'git b', status: 'fail', detail: 'broken', fix: 'irsim init' },
      ],
    } as never)

    expect(text).toBe(
      ['Config', '  ✓ config a: fine', 'Git', '  ✗ git b: broken', '      fix: irsim init', '', '1 ok, 1 failed'].join('\n'),
    )
  })
})
