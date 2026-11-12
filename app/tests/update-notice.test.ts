import { describe, expect, it } from 'vitest'
import { unlessDismissed } from '../src/canvas/use-update'
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

  it('hides the notice for the dismissed version', () => {
    expect(unlessDismissed(notice, '0.1.4')).toBeNull()
  })

  it('shows a different version again', () => {
    expect(unlessDismissed(notice, '0.1.3')).toBe(notice)
    expect(unlessDismissed(notice, null)).toBe(notice)
  })

  it('passes a missing notice through', () => {
    expect(unlessDismissed(null, '0.1.4')).toBeNull()
  })
})
