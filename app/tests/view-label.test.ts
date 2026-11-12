import { describe, expect, it } from 'vitest'
import type { CommentView } from '../src/lib/comments-types'
import { DEVICE_PRESETS, presetLabel, viewLabel, viewportLine } from '../src/lib/view-label'

const view = (overrides: Partial<CommentView> = {}): CommentView => ({
  width: 390,
  height: 844,
  preset: 'phone',
  scrollX: 0,
  scrollY: 0,
  ...overrides,
})

describe('DEVICE_PRESETS', () => {
  it('lists the five devices with their sizes', () => {
    expect(DEVICE_PRESETS.map(({ id, width, height }) => [id, width, height])).toEqual([
      ['phone', 390, 844],
      ['large-phone', 430, 932],
      ['tablet', 768, 1024],
      ['laptop', 1280, 800],
      ['desktop', 1440, 900],
    ])
  })
})

describe('presetLabel', () => {
  it('names devices and the sizing modes', () => {
    expect(presetLabel('phone')).toBe('Phone')
    expect(presetLabel('large-phone')).toBe('Large phone')
    expect(presetLabel('fit')).toBe('Fit window')
    expect(presetLabel('board')).toBe('Board size')
    expect(presetLabel('responsive')).toBe('Responsive')
  })

  it('returns an unknown id as it is', () => {
    expect(presetLabel('watch')).toBe('watch')
    expect(presetLabel('constructor')).toBe('constructor')
  })
})

describe('viewLabel', () => {
  it('joins the label and the size with the multiplication sign', () => {
    expect(viewLabel(view())).toBe('Phone 390 × 844')
    expect(viewLabel(view({ preset: 'responsive', width: 600, height: 700 }))).toBe(
      'Responsive 600 × 700',
    )
  })
})

describe('viewportLine', () => {
  it('has no scroll part at the top', () => {
    expect(viewportLine(view())).toBe('viewport 390 x 844 (Phone)')
  })

  it('names only the scroll axes that are above zero', () => {
    expect(viewportLine(view({ scrollY: 1200 }))).toBe(
      'viewport 390 x 844 (Phone), scrolled to y 1200',
    )
    expect(viewportLine(view({ scrollX: 40 }))).toBe(
      'viewport 390 x 844 (Phone), scrolled to x 40',
    )
    expect(viewportLine(view({ scrollX: 40, scrollY: 1200 }))).toBe(
      'viewport 390 x 844 (Phone), scrolled to x 40, y 1200',
    )
  })
})
