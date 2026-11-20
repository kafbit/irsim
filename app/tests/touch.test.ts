import { describe, expect, it } from 'vitest'
import { touchOn } from '../src/canvas/touch'
import type { PresetId } from '../src/canvas/viewport'

describe('touchOn', () => {
  it.each<PresetId>(['phone', 'large-phone', 'tablet'])('is on for %s in auto', (preset) => {
    expect(touchOn(null, preset)).toBe(true)
  })

  it.each<PresetId>(['laptop', 'desktop', 'fit', 'board', 'responsive'])(
    'is off for %s in auto',
    (preset) => {
      expect(touchOn(null, preset)).toBe(false)
    },
  )

  it.each<PresetId>(['phone', 'laptop', 'fit', 'responsive'])('on overrides %s', (preset) => {
    expect(touchOn('on', preset)).toBe(true)
  })

  it.each<PresetId>(['phone', 'tablet', 'laptop', 'board'])('off overrides %s', (preset) => {
    expect(touchOn('off', preset)).toBe(false)
  })
})
