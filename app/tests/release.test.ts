import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestRelease } from '../src/lib/release'

const HOUR = 60 * 60 * 1000
const output = (tag: string) => JSON.stringify({ tagName: tag, url: `https://example.test/${tag}` })

describe('latestRelease', () => {
  let dir: string
  let cacheFile: string
  let clock: number

  const deps = (run: () => Promise<string>) => ({ run, cacheFile, now: () => clock })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-'))
    cacheFile = join(dir, 'nested', 'latest-release.json')
    clock = 1_000_000
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('strips the leading v and writes the cache file', async () => {
    const run = vi.fn(async () => output('v0.2.0'))
    expect(await latestRelease(deps(run))).toEqual({ version: '0.2.0', url: 'https://example.test/v0.2.0' })
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toEqual({
      checkedAt: clock,
      release: { version: '0.2.0', url: 'https://example.test/v0.2.0' },
    })
  })

  it('does not run gh for a success cached less than 6 hours ago', async () => {
    const run = vi.fn(async () => output('v0.2.0'))
    await latestRelease(deps(run))
    clock += 6 * HOUR - 1
    expect((await latestRelease(deps(run)))?.version).toBe('0.2.0')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs gh again for a success cached 6 hours ago', async () => {
    const run = vi.fn(async () => output('v0.2.0'))
    await latestRelease(deps(run))
    clock += 6 * HOUR
    run.mockResolvedValueOnce(output('v0.3.0'))
    expect((await latestRelease(deps(run)))?.version).toBe('0.3.0')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('caches a failure for 1 hour and retries after it', async () => {
    const run = vi.fn<() => Promise<string>>(async () => {
      throw new Error('gh missing')
    })
    expect(await latestRelease(deps(run))).toBeNull()
    clock += HOUR - 1
    expect(await latestRelease(deps(run))).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    clock += 1
    run.mockResolvedValueOnce(output('v0.2.0'))
    expect((await latestRelease(deps(run)))?.version).toBe('0.2.0')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('treats bad JSON as a failure', async () => {
    const run = vi.fn(async () => 'not json')
    expect(await latestRelease(deps(run))).toBeNull()
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toEqual({ checkedAt: clock, release: null })
  })

  it('keeps the previous release when the refresh fails and retries after 1 hour', async () => {
    const run = vi.fn<() => Promise<string>>(async () => output('v0.2.0'))
    await latestRelease(deps(run))
    clock += 6 * HOUR
    run.mockRejectedValueOnce(new Error('offline'))
    expect((await latestRelease(deps(run)))?.version).toBe('0.2.0')
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toEqual({
      checkedAt: clock - 5 * HOUR,
      release: { version: '0.2.0', url: 'https://example.test/v0.2.0' },
    })
    clock += HOUR - 1
    expect((await latestRelease(deps(run)))?.version).toBe('0.2.0')
    expect(run).toHaveBeenCalledTimes(2)
    clock += 1
    run.mockResolvedValueOnce(output('v0.3.0'))
    expect((await latestRelease(deps(run)))?.version).toBe('0.3.0')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('keeps the previous release when the refresh output cannot be parsed', async () => {
    const run = vi.fn<() => Promise<string>>(async () => output('v0.2.0'))
    await latestRelease(deps(run))
    clock += 6 * HOUR
    run.mockResolvedValueOnce('not json')
    expect((await latestRelease(deps(run)))?.version).toBe('0.2.0')
    expect(JSON.parse(readFileSync(cacheFile, 'utf8')).release.version).toBe('0.2.0')
  })

  it('writes release null for a failure with no previous release', async () => {
    const run = vi.fn<() => Promise<string>>(async () => {
      throw new Error('offline')
    })
    expect(await latestRelease(deps(run))).toBeNull()
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toEqual({ checkedAt: clock, release: null })
  })

  it('stores the cache under IRSIM_CACHE_DIR by default', async () => {
    const saved = process.env.IRSIM_CACHE_DIR
    process.env.IRSIM_CACHE_DIR = join(dir, 'cache-root')
    try {
      const run = vi.fn(async () => output('v0.2.0'))
      await latestRelease({ run, now: () => clock })
      expect(JSON.parse(readFileSync(join(dir, 'cache-root', 'latest-release.json'), 'utf8')).release.version).toBe(
        '0.2.0',
      )
    } finally {
      if (saved === undefined) delete process.env.IRSIM_CACHE_DIR
      else process.env.IRSIM_CACHE_DIR = saved
    }
  })

  it('shares one gh call between concurrent requests', async () => {
    let release: (value: string) => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )
    const first = latestRelease(deps(run))
    const second = latestRelease(deps(run))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(run).toHaveBeenCalledTimes(1)
    release(output('v0.2.0'))
    expect((await first)?.version).toBe('0.2.0')
    expect((await second)?.version).toBe('0.2.0')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('ignores a corrupt cache file', async () => {
    writeFileSync(cacheFile.replace('nested/', ''), '{broken')
    const file = join(dir, 'latest-release.json')
    const run = vi.fn(async () => output('v0.2.0'))
    expect((await latestRelease({ run, cacheFile: file, now: () => clock }))?.version).toBe('0.2.0')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
