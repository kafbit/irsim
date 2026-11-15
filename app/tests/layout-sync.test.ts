import { describe, expect, it } from 'vitest'
import { dropServed, sectionsKey } from '../src/canvas/layout-sync'
import { initialSectionState } from '../src/canvas/sections'

const board = (name: string, x: number, section?: string) => ({
  name,
  x,
  y: 0,
  width: 300,
  height: 200,
  ...(section ? { section } : {}),
})

describe('sectionsKey', () => {
  const sections = [{ id: 's', title: 'S' }]
  it('ignores a move or resize', () => {
    expect(sectionsKey(sections, [board('A', 0, 's')])).toBe(
      sectionsKey(sections, [board('A', 900, 's')]),
    )
  })
  it('changes with a new section, a new board or a new membership', () => {
    const base = sectionsKey(sections, [board('A', 0, 's')])
    const withVariants = [...sections, { id: 't', title: 'T', variantOf: 'A' }]
    expect(sectionsKey(withVariants, [board('A', 0, 's')])).not.toBe(base)
    expect(sectionsKey(sections, [board('A', 0, 's'), board('B', 0, 's')])).not.toBe(base)
    expect(sectionsKey(sections, [board('A', 0)])).not.toBe(base)
  })
  it('rebuilds the state with the new variant section and the base moved into it', () => {
    const after = [board('A', 0, 'a-variants'), board('A-1', 400, 'a-variants')]
    const next = initialSectionState(
      [{ id: 'a-variants', title: 'A variants', variantOf: 'A' }],
      after,
    )
    expect(next.sectionOf).toEqual({ A: 'a-variants', 'A-1': 'a-variants' })
    expect(next.sections).toHaveLength(1)
  })
})

describe('dropServed', () => {
  const rect = (x: number) => ({ x, y: 0, width: 300, height: 200 })
  it('drops the rects the server now reports and keeps the others', () => {
    const placed = { A: rect(10), B: rect(20) }
    expect(dropServed(placed, [board('A', 10), board('B', 99)])).toEqual({ B: rect(20) })
  })
  it('returns the same object when nothing is dropped', () => {
    const placed = { A: rect(10) }
    expect(dropServed(placed, [board('A', 11)])).toBe(placed)
    expect(dropServed(placed, [])).toBe(placed)
  })
})
