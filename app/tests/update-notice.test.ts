import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireWatcher,
  dismissalKey,
  hasDraft,
  shouldReload,
  unlessDismissed,
} from '../src/canvas/use-update'
import { newer, noticeOf, type VersionInfo } from '../src/lib/version-info'

const info = (overrides: Partial<VersionInfo> = {}): VersionInfo => ({
  running: '0.1.3',
  installed: '0.1.3',
  latest: '0.1.3',
  releaseUrl: 'https://github.com/kafbit/irsim/releases/tag/v0.1.4',
  canUpdate: true,
  ...overrides,
})

describe('noticeOf', () => {
  it('shows nothing for a source checkout', () => {
    expect(noticeOf(info({ canUpdate: false, installed: null, latest: '0.2.0' }))).toBeNull()
  })

  it('shows nothing when there is no install to compare against', () => {
    expect(noticeOf(info({ installed: null, latest: '0.2.0' }))).toBeNull()
  })

  it('offers the update when the latest release is newer than the install', () => {
    expect(noticeOf(info({ latest: '0.1.4' }))).toEqual({
      kind: 'available',
      version: '0.1.4',
      releaseUrl: 'https://github.com/kafbit/irsim/releases/tag/v0.1.4',
    })
  })

  it('asks for a restart when the install is newer than the running canvas', () => {
    expect(noticeOf(info({ installed: '0.1.4', latest: '0.1.4' }))).toEqual({
      kind: 'restart',
      version: '0.1.4',
      releaseUrl: null,
    })
  })

  it('asks for a restart when the latest release is unknown', () => {
    expect(noticeOf(info({ installed: '0.1.4', latest: null }))?.kind).toBe('restart')
  })

  it('shows nothing when running, installed and latest are equal', () => {
    expect(noticeOf(info())).toBeNull()
  })

  it('shows nothing when the latest release is unknown and the canvas is current', () => {
    expect(noticeOf(info({ latest: null }))).toBeNull()
  })
})

describe('newer', () => {
  it('compares each numeric part, not the text', () => {
    expect(newer('0.1.10', '0.1.9')).toBe(true)
    expect(newer('0.1.3', '0.1.3')).toBe(false)
    expect(newer('0.1.2', '0.1.3')).toBe(false)
  })
})

describe('unlessDismissed', () => {
  const notice = { kind: 'available', version: '0.1.4', releaseUrl: null } as const
  const restart = { kind: 'restart', version: '0.1.4', releaseUrl: null } as const

  it('keys a dismissal by kind and version', () => {
    expect(dismissalKey(notice)).toBe('available:0.1.4')
    expect(dismissalKey(restart)).toBe('restart:0.1.4')
  })

  it('hides the notice for the dismissed kind and version', () => {
    expect(unlessDismissed(notice, 'available:0.1.4')).toBeNull()
  })

  it('shows a different version again', () => {
    expect(unlessDismissed(notice, 'available:0.1.3')).toBe(notice)
    expect(unlessDismissed(notice, null)).toBe(notice)
  })

  it('shows the restart notice for a version whose available notice was dismissed', () => {
    expect(unlessDismissed(restart, dismissalKey(notice))).toBe(restart)
  })

  it('ignores a bare version stored by an older build', () => {
    expect(unlessDismissed(notice, '0.1.4')).toBe(notice)
  })

  it('passes a missing notice through', () => {
    expect(unlessDismissed(null, 'available:0.1.4')).toBeNull()
  })
})

describe('shouldReload', () => {
  it('does nothing before a baseline is known', () => {
    expect(shouldReload(null, info(), false)).toBe(false)
  })

  it('does nothing when the fetch failed', () => {
    expect(shouldReload('0.1.3', null, false)).toBe(false)
  })

  it('does nothing while the running version is unchanged', () => {
    expect(shouldReload('0.1.3', info({ running: '0.1.3' }), false)).toBe(false)
  })

  it('reloads when the running version changed', () => {
    expect(shouldReload('0.1.3', info({ running: '0.1.4' }), false)).toBe(true)
  })

  it('does not reload while the user has a draft', () => {
    expect(shouldReload('0.1.3', info({ running: '0.1.4' }), true)).toBe(false)
  })
})

describe('hasDraft', () => {
  const doc = (values: string[], composer: boolean) => ({
    querySelectorAll: (selector: string) =>
      selector === 'textarea'
        ? values.map((value) => ({ value }))
        : composer && selector === '[role="dialog"][aria-label="New comment"]'
          ? [{}]
          : [],
  })

  it('is true for a textarea with text', () => {
    expect(hasDraft(doc(['', 'hello'], false))).toBe(true)
  })

  it('is false for empty textareas', () => {
    expect(hasDraft(doc(['', ''], false))).toBe(false)
    expect(hasDraft(doc([], false))).toBe(false)
  })

  it('is true while the comment composer is open', () => {
    expect(hasDraft(doc([], true))).toBe(true)
  })
})

describe('acquireWatcher', () => {
  afterEach(() => vi.useRealTimers())

  it('shares one interval and stops it when the last holder releases', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = acquireWatcher(first)
    const releaseSecond = acquireWatcher(second)
    vi.advanceTimersByTime(5000)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    releaseFirst()
    vi.advanceTimersByTime(5000)
    expect(second).toHaveBeenCalledTimes(1)
    releaseSecond()
    vi.advanceTimersByTime(20_000)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('starts a new interval after every holder released', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    acquireWatcher(fn)()
    const again = vi.fn()
    const release = acquireWatcher(again)
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
    expect(again).toHaveBeenCalledTimes(1)
    release()
  })
})
