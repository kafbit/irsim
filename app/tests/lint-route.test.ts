import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/api/lint/route'

let base = ''
let saved: string | undefined

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'irsim-lint-route-'))
  saved = process.env.IRSIM_DESIGN_DIR
  process.env.IRSIM_DESIGN_DIR = base
})

afterEach(() => {
  if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
  else process.env.IRSIM_DESIGN_DIR = saved
  rmSync(base, { recursive: true, force: true })
})

describe('GET /api/lint', () => {
  it('answers ok for an empty folder, uncached', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, problems: [] })
  })

  it('lists the problems of a broken canvas.json', async () => {
    mkdirSync(join(base, 'sub'))
    writeFileSync(join(base, 'canvas.json'), '{ nope')
    const body = await (await GET()).json()
    expect(body.ok).toBe(false)
    expect(body.problems[0].rule).toBe('canvas-json-invalid')
  })
})
