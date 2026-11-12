import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'

const latestRelease = vi.fn(async () => ({ version: '0.3.0', url: 'https://example.test/v0.3.0' }))
vi.mock('../src/lib/release', () => ({ latestRelease }))

const { GET } = await import('../src/app/api/version/route')

const KEYS = ['IRSIM_VERSION', 'IRSIM_PREFIX', 'IRSIM_LAUNCHER'] as const

describe('GET /api/version', () => {
  let dir: string
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    latestRelease.mockClear()
    for (const key of KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    dir = mkdtempSync(join(tmpdir(), 'version-route-'))
  })

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers a source checkout without installed, latest or an update, and never runs gh', async () => {
    const response = await GET()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      running: packageJson.version,
      installed: null,
      latest: null,
      releaseUrl: null,
      canUpdate: false,
    })
    expect(latestRelease).not.toHaveBeenCalled()
  })

  it('answers a release install with the version current points at', async () => {
    mkdirSync(join(dir, '0.2.0'))
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_VERSION = '0.1.9'
    process.env.IRSIM_LAUNCHER = join(dir, '0.2.0', 'bin', 'irsim')
    expect(await (await GET()).json()).toEqual({
      running: '0.1.9',
      installed: '0.2.0',
      latest: '0.3.0',
      releaseUrl: 'https://example.test/v0.3.0',
      canUpdate: true,
    })
    expect(latestRelease).toHaveBeenCalledTimes(1)
  })

  it('answers installed null and no update when current cannot be resolved', async () => {
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_LAUNCHER = join(dir, 'irsim')
    const body = await (await GET()).json()
    expect(body.installed).toBeNull()
    expect(body.canUpdate).toBe(false)
    expect(latestRelease).not.toHaveBeenCalled()
  })
})
