import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..', '..')
const IRSIM_CLI = join(ROOT, 'bin', 'irsim')
const CONNECTORS_BIN = join(ROOT, 'plugin', 'bin', 'irsim-connectors.mjs')
const PLUGIN_DIR = join(ROOT, 'plugin', 'harnesses', 'antigravity')

describe('antigravity connect installers', () => {
  let dir = ''
  let logFile = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'irsim-connect-'))
    logFile = join(dir, 'agy-calls.json')
    const agy = join(dir, 'agy')
    writeFileSync(
      agy,
      [
        '#!/' + 'usr/bin/env node',
        "import { writeFileSync } from 'node:fs'",
        `writeFileSync(${JSON.stringify(logFile)}, JSON.stringify(process.argv.slice(2)))`,
      ].join('\n'),
    )
    chmodSync(agy, 0o755)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const runWithMockAgy = (script: string, args: string[]) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
    })

  const runWithoutAgy = (script: string, args: string[]) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dirname(process.execPath) },
    })

  it('installs the bundled Antigravity plugin via irsim connect', () => {
    for (const alias of ['antigravity', 'agy']) {
      const res = runWithMockAgy(IRSIM_CLI, ['connect', alias])
      expect(res.status).toBe(0)
      expect(JSON.parse(readFileSync(logFile, 'utf8'))).toEqual(['plugin', 'install', PLUGIN_DIR])
    }
  })

  it('uninstalls the Antigravity plugin via irsim connect --uninstall', () => {
    const res = runWithMockAgy(IRSIM_CLI, ['connect', 'antigravity', '--uninstall'])
    expect(res.status).toBe(0)
    expect(JSON.parse(readFileSync(logFile, 'utf8'))).toEqual(['plugin', 'uninstall', 'irsim'])
  })

  it('rejects unknown agents with exit code 2', () => {
    const res = runWithMockAgy(IRSIM_CLI, ['connect', 'unknown'])
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('unknown agent unknown')
  })

  it('installs and uninstalls via the npm @kafbit/irsim-connectors bin', () => {
    const installRes = runWithMockAgy(CONNECTORS_BIN, ['antigravity'])
    expect(installRes.status).toBe(0)
    expect(JSON.parse(readFileSync(logFile, 'utf8'))).toEqual(['plugin', 'install', PLUGIN_DIR])

    const uninstallRes = runWithMockAgy(CONNECTORS_BIN, ['antigravity', '--uninstall'])
    expect(uninstallRes.status).toBe(0)
    expect(JSON.parse(readFileSync(logFile, 'utf8'))).toEqual(['plugin', 'uninstall', 'irsim'])
  })

  it('fails clearly when agy is not on PATH', () => {
    for (const script of [IRSIM_CLI, CONNECTORS_BIN]) {
      const args = script === IRSIM_CLI ? ['connect', 'antigravity'] : ['antigravity']
      const res = runWithoutAgy(script, args)
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('agy is not installed or not on PATH')
    }
  })
})
