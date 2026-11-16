import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectSlug, resetSessionInfoCache, sessionInfo } from '../src/lib/session-info'

describe('session info', () => {
  let dir: string
  const saved = process.env.CLAUDE_CONFIG_DIR
  const cwd = '/work/my.app_1'

  const transcript = (slug: string, id: string, records: object[]) => {
    mkdirSync(join(dir, 'projects', slug), { recursive: true })
    writeFileSync(
      join(dir, 'projects', slug, `${id}.jsonl`),
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    )
  }
  const session = (id: string) => ({ id, label: 'fallback', cwd })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claude-dir-'))
    process.env.CLAUDE_CONFIG_DIR = dir
    resetSessionInfoCache()
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('replaces every character outside letters and digits with a dash', () => {
    expect(projectSlug('/home/assawalhy/Projects/irsim')).toBe('-home-assawalhy-Projects-irsim')
    expect(projectSlug(cwd)).toBe('-work-my-app-1')
  })

  it('takes the newest ai title', async () => {
    transcript(projectSlug(cwd), 's1', [
      { type: 'ai-title', aiTitle: 'Old' },
      { type: 'user' },
      { type: 'ai-title', aiTitle: 'New' },
    ])
    expect((await sessionInfo(session('s1'))).title).toBe('New')
  })

  it('prefers a custom title over a newer ai title, and the newest custom title wins', async () => {
    transcript(projectSlug(cwd), 's2', [
      { type: 'custom-title', customTitle: 'First' },
      { type: 'custom-title', customTitle: 'Second' },
      { type: 'ai-title', aiTitle: 'Generated' },
    ])
    expect((await sessionInfo(session('s2'))).title).toBe('Second')
  })

  it('falls back to the label when the transcript is missing or has no title', async () => {
    expect((await sessionInfo(session('none'))).title).toBe('fallback')
    transcript(projectSlug(cwd), 's3', [{ type: 'user' }])
    expect((await sessionInfo(session('s3'))).title).toBe('fallback')
  })

  it('finds the transcript in another project directory', async () => {
    transcript('-other', 's4', [{ type: 'ai-title', aiTitle: 'Elsewhere' }])
    expect((await sessionInfo(session('s4'))).title).toBe('Elsewhere')
  })

  it('reads a title from the tail of a large transcript', async () => {
    transcript(projectSlug(cwd), 's5', [
      { type: 'ai-title', aiTitle: 'Too far back' },
      { type: 'user', text: 'x'.repeat(400 * 1024) },
      { type: 'ai-title', aiTitle: 'Near the end' },
    ])
    expect((await sessionInfo(session('s5'))).title).toBe('Near the end')
  })

  it('reports the branch of the cwd and omits it when git fails', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'session-repo-'))
    try {
      const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args])
      git('init', '-q', '-b', 'feat/x')
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
      expect((await sessionInfo({ id: 'b', label: 'l', cwd: repo })).branch).toBe('feat/x')
      const missing = await sessionInfo({ id: 'c', label: 'l', cwd: join(repo, 'nope') })
      expect(missing.branch).toBeUndefined()
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('session titles of other agents', () => {
  const homes = ['COMMANDCODE_HOME', 'CODEX_HOME'] as const
  const saved = Object.fromEntries(homes.map((name) => [name, process.env[name]]))
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-dir-'))
    process.env.COMMANDCODE_HOME = join(dir, 'cc')
    process.env.CODEX_HOME = join(dir, 'codex')
    resetSessionInfoCache()
  })
  afterEach(() => {
    for (const name of homes) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the Command Code title and follows a rename', async () => {
    const meta = join(dir, 'cc', 'projects', 'some-project')
    mkdirSync(meta, { recursive: true })
    writeFileSync(join(meta, 'c1.meta.json'), JSON.stringify({ title: 'First name' }))
    const session = { id: 'c1', label: 'fallback', cwd: '/nowhere', agent: 'command-code' as const }
    expect((await sessionInfo(session)).title).toBe('First name')
    await new Promise((resolve) => setTimeout(resolve, 20))
    writeFileSync(join(meta, 'c1.meta.json'), JSON.stringify({ title: 'Renamed' }))
    expect((await sessionInfo(session)).title).toBe('Renamed')
  })

  it('reads the newest Codex thread name', async () => {
    mkdirSync(join(dir, 'codex'), { recursive: true })
    writeFileSync(
      join(dir, 'codex', 'session_index.jsonl'),
      [
        { id: 'x1', thread_name: 'Old name' },
        { id: 'other', thread_name: 'Not mine' },
        { id: 'x1', thread_name: 'New name' },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n',
    )
    const session = { id: 'x1', label: 'fallback', cwd: '/nowhere', agent: 'codex' as const }
    expect((await sessionInfo(session)).title).toBe('New name')
  })

  it('keeps the label for an agent with no known store', async () => {
    const session = { id: 'p1', label: 'My label', cwd: '/nowhere', agent: 'pi' as const }
    expect((await sessionInfo(session)).title).toBe('My label')
  })
})
