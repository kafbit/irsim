import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const LAUNCHER = resolve(__dirname, '../../bin/irsim')
let dir = ''

const run = (...args: string[]) =>
  spawnSync('node', [LAUNCHER, 'lint', '--design-dir', dir, ...args], { encoding: 'utf8' })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-lint-cli-'))
  mkdirSync(join(dir, 'x'))
  dir = join(dir, 'x')
})
afterEach(() => rmSync(resolve(dir, '..'), { recursive: true, force: true }))

describe('irsim lint', () => {
  it('exits 1 on an error and prints the JSON result', () => {
    writeFileSync(join(dir, 'canvas.json'), '{ nope')
    const result = run('--json')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).problems[0].rule).toBe('canvas-json-invalid')
  })

  it('exits 0 with warnings only and prints a summary line', () => {
    writeFileSync(
      join(dir, 'A.html'),
      '<html lang="en"><head><title>A</title></head><body><script type="text/x-dc" data-props=\'{"$preview":{"width":800,"height":600}}\'></script></body></html>',
    )
    writeFileSync(join(dir, 'canvas.json'), '{"version":1,"pages":[]}')
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('board-unlisted')
    expect(result.stdout).toContain('0 errors, 1 warnings')
  })

  it('--fix renames a legacy board and never deletes a file', () => {
    writeFileSync(
      join(dir, 'Old.dc.html'),
      '<html><head><title>Old</title></head><body><script type="text/x-dc" data-props=\'{}\'></script></body></html>',
    )
    run('--fix')
    expect(existsSync(join(dir, 'Old.html'))).toBe(true)
    expect(existsSync(join(dir, 'Old.dc.html'))).toBe(false)
  })
})
