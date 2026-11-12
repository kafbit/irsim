import { afterEach, describe, expect, it } from 'vitest'
import { isUpdating, setUpdating } from '../src/lib/update-state'

afterEach(() => setUpdating(false))

describe('update state', () => {
  it('starts idle', () => {
    expect(isUpdating()).toBe(false)
  })

  it('reports the value that was set', () => {
    setUpdating(true)
    expect(isUpdating()).toBe(true)
    setUpdating(false)
    expect(isUpdating()).toBe(false)
  })
})

describe('shared state', () => {
  it('is shared by two separately loaded instances', async () => {
    const a = await import('../src/lib/update-state?a')
    const b = await import('../src/lib/update-state?b')
    a.setUpdating(true)
    expect(b.isUpdating()).toBe(true)
    b.setUpdating(false)
    expect(a.isUpdating()).toBe(false)
  })
})
