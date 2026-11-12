import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const BIN = resolve(import.meta.dirname, '..', '..', 'bin')

const serverSource = (version: string, exitCode: number, swapTo: string | null) => `
import { appendFileSync, existsSync, renameSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const marker = process.env.IRSIM_TEST_MARKER
appendFileSync(marker, '${version} ' + process.env.IRSIM_VERSION + '\\n')
const pidFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.pids', String(process.pid))
appendFileSync(marker + '.pids', '${version} ' + existsSync(pidFile) + '\\n')
${
  swapTo
    ? `const prefix = process.env.IRSIM_PREFIX
symlinkSync('${swapTo}', join(prefix, '.swap'))
renameSync(join(prefix, '.swap'), join(prefix, 'current'))`
    : ''
}
process.exit(${exitCode})
`

const makeVersion = (prefix: string, version: string, server?: string) => {
  const dir = join(prefix, version)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  cpSync(join(BIN, 'irsim'), join(dir, 'bin', 'irsim'))
  chmodSync(join(dir, 'bin', 'irsim'), 0o755)
  cpSync(join(BIN, 'package.json'), join(dir, 'bin', 'package.json'))
  cpSync(join(BIN, 'lib'), join(dir, 'bin', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'VERSION'), `${version}\n`)
  if (server !== undefined) {
    mkdirSync(join(dir, 'server'))
    writeFileSync(join(dir, 'server', 'server.js'), server)
  }
  return dir
}

const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => done(port))
    })
  })

const run = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) =>
  new Promise<number | null>((done) => {
    const child = spawn(command, args, { ...options, stdio: 'ignore' })
    child.on('exit', (code) => done(code))
  })

describe('launcher restart and update cleanup', () => {
  let dir: string
  let prefix: string
  let project: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'launcher-'))
    prefix = join(dir, 'prefix')
    project = join(dir, 'project')
    mkdirSync(prefix)
    mkdirSync(join(project, 'design'), { recursive: true })
    writeFileSync(join(project, '.irsim.json'), '{"designDir":"design"}\n')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('restarts into the current version when the server exits with 75', async () => {
    makeVersion(prefix, '1.0.0', serverSource('1.0.0', 75, '1.0.1'))
    makeVersion(prefix, '1.0.1', serverSource('1.0.1', 0, null))
    symlinkSync('1.0.0', join(prefix, 'current'))
    const marker = join(dir, 'marker')
    const port = await freePort()
    const code = await run(
      'node',
      [join(prefix, '1.0.0', 'bin', 'irsim'), 'serve', '--port', String(port), '--design-dir', join(project, 'design')],
      { cwd: project, env: { ...process.env, IRSIM_TEST_MARKER: marker, IRSIM_PORT: '' } },
    )
    expect(code).toBe(0)
    expect(readFileSync(marker, 'utf8')).toBe('1.0.0 1.0.0\n1.0.1 1.0.1\n')
    expect(readFileSync(`${marker}.pids`, 'utf8')).toBe('1.0.0 true\n1.0.1 true\n')
    expect(readlinkSync(join(prefix, 'current'))).toBe('1.0.1')
    for (const version of ['1.0.0', '1.0.1']) {
      expect(readdirSync(join(prefix, version, '.pids'))).toEqual([])
    }
  })

  it('does not restart a source checkout that exits with 75', async () => {
    const root = join(dir, 'checkout')
    makeVersion(dir, 'checkout', serverSource('source', 75, null))
    const marker = join(dir, 'marker')
    const port = await freePort()
    const code = await run(
      'node',
      [join(root, 'bin', 'irsim'), 'serve', '--port', String(port), '--design-dir', join(project, 'design')],
      { cwd: project, env: { ...process.env, IRSIM_TEST_MARKER: marker, IRSIM_PORT: '' } },
    )
    expect(code).toBe(75)
    expect(readFileSync(marker, 'utf8')).toBe('source checkout\n')
    expect(existsSync(join(root, '.pids'))).toBe(false)
  })

  it('update keeps a version directory with a live server and removes the others', () => {
    makeVersion(prefix, '1.0.0')
    makeVersion(prefix, '1.0.1')
    makeVersion(prefix, '0.9.0')
    makeVersion(prefix, '0.8.0')
    symlinkSync('1.0.0', join(prefix, 'current'))
    const dead = spawnSync('true').pid
    mkdirSync(join(prefix, '1.0.1', '.pids'))
    writeFileSync(join(prefix, '1.0.1', '.pids', String(process.pid)), '')
    mkdirSync(join(prefix, '0.9.0', '.pids'))
    writeFileSync(join(prefix, '0.9.0', '.pids', String(dead)), '')
    const stage = join(dir, 'stage')
    mkdirSync(join(stage, 'irsim-1.0.2'), { recursive: true })
    writeFileSync(join(stage, 'irsim-1.0.2', 'VERSION'), '1.0.2\n')
    const archive = join(dir, 'release.tar.gz')
    expect(spawnSync('tar', ['-czf', archive, '-C', stage, 'irsim-1.0.2']).status).toBe(0)
    const asset = `irsim-1.0.2-${process.platform}-${process.arch}.tar.gz`
    const fakeBin = join(dir, 'fake-bin')
    mkdirSync(fakeBin)
    writeFileSync(
      join(fakeBin, 'gh'),
      `#!/bin/sh
if [ "$2" = "view" ]; then echo v1.0.2; exit 0; fi
dir=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--dir" ]; then dir="$2"; fi
  shift
done
cp "${archive}" "$dir/${asset}"
`,
    )
    chmodSync(join(fakeBin, 'gh'), 0o755)
    const result = spawnSync('node', [join(prefix, '1.0.0', 'bin', 'irsim'), 'update'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(readdirSync(prefix).sort()).toEqual(['1.0.0', '1.0.1', '1.0.2', 'current'])
    expect(readlinkSync(join(prefix, 'current'))).toBe('1.0.2')
    expect(existsSync(join(prefix, '1.0.1', '.pids', String(process.pid)))).toBe(true)
  })
})
