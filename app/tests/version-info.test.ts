import { describe, expect, it } from 'vitest'
import { newer } from '../src/lib/version-info'

describe('newer', () => {
  it('compares the core numerically by segment, missing segments are 0', () => {
    expect(newer('0.1.10', '0.1.9')).toBe(true)
    expect(newer('1.0', '1.0.0')).toBe(false)
    expect(newer('1.0.1', '1.0')).toBe(true)
    expect(newer('1.0.0', '1.0.0')).toBe(false)
  })

  it('ranks a release above its prerelease', () => {
    expect(newer('1.0.0', '1.0.0-rc.1')).toBe(true)
    expect(newer('1.0.0-rc.1', '1.0.0')).toBe(false)
  })

  it('lets a higher core win over any prerelease', () => {
    expect(newer('1.0.1-rc.1', '1.0.0')).toBe(true)
    expect(newer('1.0.0-rc.1', '1.0.1')).toBe(false)
  })

  it('compares prerelease identifiers left to right', () => {
    expect(newer('1.0.0-rc.2', '1.0.0-rc.1')).toBe(true)
    expect(newer('1.0.0-rc.10', '1.0.0-rc.9')).toBe(true)
    expect(newer('1.0.0-rc.1', '1.0.0-rc.1')).toBe(false)
    expect(newer('1.0.0-beta', '1.0.0-alpha')).toBe(true)
    expect(newer('1.0.0-alpha', '1.0.0-beta')).toBe(false)
  })

  it('ranks numeric identifiers below alphanumeric ones', () => {
    expect(newer('1.0.0-alpha', '1.0.0-1')).toBe(true)
    expect(newer('1.0.0-1', '1.0.0-alpha')).toBe(false)
  })

  it('ranks fewer identifiers older when the shared ones are equal', () => {
    expect(newer('1.0.0-alpha.1', '1.0.0-alpha')).toBe(true)
    expect(newer('1.0.0-alpha', '1.0.0-alpha.1')).toBe(false)
  })

  it('ignores build metadata', () => {
    expect(newer('1.0.0+build.5', '1.0.0')).toBe(false)
    expect(newer('1.0.0', '1.0.0+build.5')).toBe(false)
    expect(newer('1.0.1+a', '1.0.0+b')).toBe(true)
  })
})
