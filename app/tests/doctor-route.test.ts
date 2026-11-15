import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/api/doctor/route'

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = { IRSIM_LAUNCHER: process.env.IRSIM_LAUNCHER, IRSIM_ROOT: process.env.IRSIM_ROOT }
  delete process.env.IRSIM_LAUNCHER
  delete process.env.IRSIM_ROOT
})

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('GET /api/doctor', () => {
  it('answers 409 and names irsim serve when no launcher started the server', async () => {
    const response = await GET()

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('irsim serve')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('runs the launcher doctor and passes its report through', async () => {
    const root = resolve(import.meta.dirname, '..', '..')
    process.env.IRSIM_LAUNCHER = join(root, 'bin', 'irsim')
    process.env.IRSIM_ROOT = root

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('checks')
    expect(body).toHaveProperty('context.irsim')
    expect(Array.isArray(body.checks)).toBe(true)
    expect(typeof body.ok).toBe('boolean')
  }, 60_000)
})
