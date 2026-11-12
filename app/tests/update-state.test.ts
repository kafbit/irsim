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
