import { describe, expect, test } from 'bun:test'
import {
  canvasHref,
  columnScale,
  compareHref,
  confirmText,
  generateLabel,
  isCompareWidth,
  mountLimit,
  sentLabel,
  togglePreset,
  variantsOf,
  widthOf,
} from '../src/canvas/variants/variants-model'
import type { ManifestBoard } from '../src/canvas/types'

const board = (name: string, variantOf?: string) =>
  ({ name, variantOf }) as unknown as ManifestBoard

describe('variants model', () => {
  test('togglePreset adds then removes a label in order', () => {
    expect(togglePreset(['Better'], 'Clearer')).toEqual(['Better', 'Clearer'])
    expect(togglePreset(['Better', 'Clearer'], 'Better')).toEqual(['Clearer'])
  })
  test('labels follow the count', () => {
    expect(generateLabel(0)).toBe('Generate')
    expect(generateLabel(1)).toBe('Generate 1 variant')
    expect(generateLabel(2)).toBe('Generate 2 variants')
    expect(sentLabel('Claude Code session', 2)).toBe(
      'Sent to Claude Code session. 2 variants are on the canvas.',
    )
  })
  test('hrefs are encoded', () => {
    expect(compareHref('a b', 'X')).toBe('/p/a%20b/compare/X')
    expect(canvasHref('p', 'X')).toBe('/p/p?board=X')
  })
  test('variantsOf keeps the variants of one base', () => {
    const list = [board('A'), board('AV', 'A'), board('BV', 'B')]
    expect(variantsOf(list, 'A').map((b) => b.name)).toEqual(['AV'])
  })
  test('widthOf and isCompareWidth', () => {
    expect(widthOf('board', { width: 480 })).toBe(480)
    expect(widthOf('768', { width: 480 })).toBe(768)
    expect(isCompareWidth('390')).toBe(true)
    expect(isCompareWidth('999')).toBe(false)
  })
  test('columnScale fits and never exceeds 1', () => {
    expect(columnScale(1280, 640)).toBe(0.5)
    expect(columnScale(390, 640)).toBe(1)
    expect(columnScale(390, 0)).toBe(0)
  })
  test('mountLimit grows with settled columns', () => {
    expect(mountLimit(0)).toBe(2)
    expect(mountLimit(3)).toBe(5)
  })
})

describe('confirmText', () => {
  test('Choose names the base and the pick, and what is deleted', () => {
    expect(confirmText({ base: 'CanvasInspector', pick: 'V1', label: 'Simpler', variants: 2 })).toEqual({
      title: 'Replace CanvasInspector with Simpler?',
      text: 'The original and the other variant are deleted.',
      action: 'Replace',
    })
    expect(confirmText({ base: 'B', pick: 'V1', label: 'A', variants: 3 }).text).toBe(
      'The original and the other 2 variants are deleted.',
    )
    expect(confirmText({ base: 'B', pick: 'V1', label: 'A', variants: 1 }).text).toBe(
      'The original is deleted.',
    )
  })

  test('Keep original counts the variants it deletes', () => {
    expect(confirmText({ base: 'B', pick: 'B', label: 'Original', variants: 2 })).toEqual({
      title: 'Keep the original?',
      text: 'The 2 variants are deleted.',
      action: 'Keep original',
    })
    expect(confirmText({ base: 'B', pick: 'B', label: 'Original', variants: 1 }).text).toBe(
      'The 1 variant is deleted.',
    )
  })
})
