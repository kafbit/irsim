import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDoctor, summaryOf } from '../src/canvas/use-doctor'

const report = (summary: { ok: number; warn: number; fail: number; skip: number }) =>
  ({
    ok: summary.fail === 0,
    root: '/repo',
    summary,
    checks: [],
    context: {
      root: '/repo',
      designDir: '/repo/design',
      boards: 2,
      repo: 'owner/repo',
      remote: 'git@github.com:owner/repo.git',
      branch: 'main',
      commit: 'abc1234',
      detached: false,
      dirty: 0,
      port: 3200,
      running: true,
      irsim: '0.2.2',
      node: 'v26.0.0',
      platform: 'linux-x64',
      home: '/home/me',
    },
  }) as never

describe('summaryOf', () => {
  it('names a clean report by its passing count', () => {
    expect(summaryOf(report({ ok: 8, warn: 0, fail: 0, skip: 0 }))).toBe('8 passed')
  })

  it('adds warnings, failures and skips only when they are non-zero', () => {
    expect(summaryOf(report({ ok: 8, warn: 2, fail: 1, skip: 0 }))).toBe('8 passed · 2 warnings · 1 failed')
    expect(summaryOf(report({ ok: 8, warn: 1, fail: 0, skip: 3 }))).toBe('8 passed · 1 warning · 3 skipped')
    expect(summaryOf(report({ ok: 0, warn: 0, fail: 1, skip: 0 }))).toBe('0 passed · 1 failed')
  })
})

describe('readDoctor', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const respond = (status: number, body: unknown) =>
    Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body })

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the report on 200', async () => {
    fetchMock.mockReturnValue(respond(200, report({ ok: 3, warn: 0, fail: 0, skip: 0 })))

    expect(await readDoctor()).toMatchObject({ status: 'ready' })
  })

  it('reports a 409 as unavailable, with the reason the route gave', async () => {
    fetchMock.mockReturnValue(respond(409, { error: 'start it with irsim serve' }))

    expect(await readDoctor()).toEqual({ status: 'unavailable', message: 'start it with irsim serve' })
  })

  it('reports another status as a failure', async () => {
    fetchMock.mockReturnValue(respond(500, { error: 'irsim doctor failed' }))

    expect(await readDoctor()).toEqual({ status: 'failed', message: 'irsim doctor failed' })
  })

  it('reports a network error as a failure instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    expect(await readDoctor()).toEqual({ status: 'failed', message: 'offline' })
  })
})
