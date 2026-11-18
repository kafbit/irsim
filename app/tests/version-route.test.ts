import { mkdirSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'

const latestRelease = vi.fn(async () => ({ version: '0.3.0', url: 'https://example.test/v0.3.0' }))
vi.mock('../src/lib/release', () => ({ latestRelease }))

const { GET } = await import('../src/app/api/version/route')

const KEYS = ['IRSIM_VERSION', 'IRSIM_PREFIX', 'IRSIM_LAUNCHER', 'IRSIM_BUILD'] as const

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
      build: null,
      installedBuild: null,
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
      build: null,
      installedBuild: null,
    })
    expect(latestRelease).toHaveBeenCalledTimes(1)
  })

  it('answers the running and installed build stamps', async () => {
    mkdirSync(join(dir, '0.2.0'))
    writeFileSync(join(dir, '0.2.0', 'BUILD'), '0.2.0-200\n')
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_BUILD = '0.2.0-100'
    process.env.IRSIM_LAUNCHER = join(dir, '0.2.0', 'bin', 'irsim')
    const body = await (await GET(new Request('http://localhost/api/version?latest=0'))).json()
    expect(body.build).toBe('0.2.0-100')
    expect(body.installedBuild).toBe('0.2.0-200')
  })

  it('answers installed null and no update when current cannot be resolved', async () => {
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_LAUNCHER = join(dir, 'irsim')
    const body = await (await GET()).json()
    expect(body.installed).toBeNull()
    expect(body.canUpdate).toBe(false)
    expect(latestRelease).not.toHaveBeenCalled()
  })

  it('skips the release check and answers latest null for ?latest=0', async () => {
    mkdirSync(join(dir, '0.2.0'))
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_VERSION = '0.1.9'
    process.env.IRSIM_LAUNCHER = join(dir, '0.2.0', 'bin', 'irsim')
    const body = await (await GET(new Request('http://localhost/api/version?latest=0'))).json()
    expect(body).toEqual({
      running: '0.1.9',
      installed: '0.2.0',
      latest: null,
      releaseUrl: null,
      canUpdate: true,
      build: null,
      installedBuild: null,
    })
    expect(latestRelease).not.toHaveBeenCalled()
  })

  it('still checks the latest release for a request without ?latest=0', async () => {
    mkdirSync(join(dir, '0.2.0'))
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_LAUNCHER = join(dir, '0.2.0', 'bin', 'irsim')
    const body = await (await GET(new Request('http://localhost/api/version'))).json()
    expect(body.latest).toBe('0.3.0')
    expect(latestRelease).toHaveBeenCalledTimes(1)
  })

  it('answers the version of a local install without its -local suffix', async () => {
    mkdirSync(join(dir, '0.3.0-local'))
    symlinkSync('0.3.0-local', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_VERSION = '0.3.0'
    process.env.IRSIM_LAUNCHER = join(dir, '0.3.0-local', 'bin', 'irsim')
    const body = await (await GET(new Request('http://localhost/api/version'))).json()
    expect(body.installed).toBe('0.3.0')
  })

  it('asks for a fresh release check for ?fresh=1', async () => {
    mkdirSync(join(dir, '0.2.0'))
    symlinkSync('0.2.0', join(dir, 'current'))
    process.env.IRSIM_PREFIX = dir
    process.env.IRSIM_LAUNCHER = join(dir, '0.2.0', 'bin', 'irsim')
    await GET(new Request('http://localhost/api/version?fresh=1'))
    expect(latestRelease).toHaveBeenCalledWith({ fresh: true })
    latestRelease.mockClear()
    await GET(new Request('http://localhost/api/version'))
    expect(latestRelease).toHaveBeenCalledWith({ fresh: false })
  })
})
