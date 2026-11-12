import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let latest: { version: string; url: string } | null = { version: '0.3.0', url: 'u' }
vi.mock('../src/lib/release', () => ({ latestRelease: async () => latest }))

const { POST } = await import('../src/app/api/update/route')
const { setExit } = await import('../src/lib/restart')

const KEYS = ['IRSIM_PREFIX', 'IRSIM_LAUNCHER', 'IRSIM_ROOT'] as const

const until = async (check: () => boolean, timeout = 2000) => {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('POST /api/update', () => {
  let dir: string
  let exit: ReturnType<typeof vi.fn<(code: number) => void>>
  let restore: () => void
  const saved: Record<string, string | undefined> = {}

  const launcher = (body: string) => {
    const file = join(dir, 'launcher.mjs')
    writeFileSync(file, body)
    chmodSync(file, 0o755)
    process.env.IRSIM_LAUNCHER = file
  }

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    dir = mkdtempSync(join(tmpdir(), 'update-route-'))
    mkdirSync(join(dir, '0.2.0'))
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_ROOT = dir
    latest = { version: '0.3.0', url: 'u' }
    exit = vi.fn()
    restore = setExit(exit)
  })

  afterEach(() => {
    restore()
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers 409 when this server is not a release install', async () => {
    delete process.env.IRSIM_PREFIX
    const response = await POST()
    expect(response.status).toBe(409)
    expect(await response.json()).toHaveProperty('error')
  })

  it('answers 403 to a request from another site, and does not exit', async () => {
    launcher('process.exit(0)\n')
    const response = await POST(
      new Request('http://localhost/api/update', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    )
    expect(response.status).toBe(403)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(exit).not.toHaveBeenCalled()
  })

  it('runs update when a newer release exists, answers 202 and exits with 75', async () => {
    launcher(
      `import { rmSync, symlinkSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const prefix = ${JSON.stringify(dir)}
mkdirSync(join(prefix, '0.3.0'))
symlinkSync('0.3.0', join(prefix, '.new'))
renameSync(join(prefix, '.new'), join(prefix, 'current'))
`,
    )
    const response = await POST()
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ restarting: true, version: '0.3.0' })
    await until(() => exit.mock.calls.length > 0)
    expect(exit).toHaveBeenCalledWith(75)
  })

  it('skips update when installed is the latest and still restarts', async () => {
    latest = { version: '0.2.0', url: 'u' }
    launcher(`import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(join(dir, 'ran'))}, '')\n`)
    const response = await POST()
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ restarting: true, version: '0.2.0' })
    expect(() => readFileSync(join(dir, 'ran'))).toThrow()
    await until(() => exit.mock.calls.length > 0)
    expect(exit).toHaveBeenCalledWith(75)
  })

  it('answers 500 with the last stderr line when update fails', async () => {
    launcher(`console.error('first')\nconsole.error('irsim: gh not logged in')\nprocess.exit(1)\n`)
    const response = await POST()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'irsim: gh not logged in' })
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(exit).not.toHaveBeenCalled()
  })

  it('answers 409 to a second request while one is running', async () => {
    launcher(`await new Promise((resolve) => setTimeout(resolve, 600))\n`)
    const first = POST()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await POST()
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'an update is already running' })
    expect((await first).status).toBe(202)
    await until(() => exit.mock.calls.length > 0)
  })
})
