import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { POST } = await import('../src/app/api/restart/route')
const { RESTART_CODE, setExit } = await import('../src/lib/restart')

const KEYS = ['IRSIM_PREFIX', 'IRSIM_LAUNCHER'] as const

const post = (headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/restart', { method: 'POST', headers }))

describe('POST /api/restart', () => {
  let dir: string
  let exit: ReturnType<typeof vi.fn<(code: number) => void>>
  let restore: () => void
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    dir = mkdtempSync(join(tmpdir(), 'restart-route-'))
    exit = vi.fn()
    restore = setExit(exit)
  })

  afterEach(() => {
    restore()
    vi.useRealTimers()
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a request that is not local', async () => {
    const response = await post({ origin: 'https://evil.test', host: 'localhost' })
    expect(response.status).toBe(403)
    expect(exit).not.toHaveBeenCalled()
  })

  it('answers 409 when the server was not started by irsim serve', async () => {
    const response = await post()
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('not started by irsim serve')
    expect(exit).not.toHaveBeenCalled()
  })

  it('answers 202 with the installed build and exits with the restart code', async () => {
    mkdirSync(join(dir, '0.2.0'))
    writeFileSync(join(dir, '0.2.0', 'BUILD'), '0.2.0-200\n')
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_LAUNCHER = join(dir, 'irsim')
    vi.useFakeTimers()
    const response = await post()
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      restarting: true,
      build: '0.2.0-200',
      version: '0.2.0',
    })
    vi.advanceTimersByTime(300)
    expect(exit).toHaveBeenCalledWith(RESTART_CODE)
  })
})
