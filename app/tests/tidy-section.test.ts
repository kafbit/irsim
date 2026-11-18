import { describe, expect, it } from 'vitest'
import { clearLayoutEdits, sectionTidyEdits } from '../src/canvas/tidy-section'

const board = (name: string, x: number, y: number, section?: string, width = 100, height = 50) => ({
  name,
  x,
  y,
  width,
  height,
  ...(section ? { section } : {}),
})
const section = { id: 's1', title: 'One' }
const boards = [
  board('a', 500, 300, 's1'),
  board('b', 100, 20, 's1'),
  board('c', 300, 40, 's1'),
  board('out', 900, 900),
  board('sub', 0, 0, 's2'),
]
const geometry = (edit: ReturnType<typeof sectionTidyEdits>) =>
  Object.fromEntries((edit?.after.boards ?? []).map((item) => [item.name, [item.x, item.y]]))

describe('sectionTidyEdits', () => {
  it('lays the direct members in a row from the top left of their bounding box', () => {
    const edit = sectionTidyEdits(section, boards, { mode: 'row', gap: 40 })
    expect(geometry(edit)).toEqual({ c: [240, 20], a: [380, 20] })
    expect(edit?.before.boards?.find((item) => item.name === 'a')).toMatchObject({ x: 500, y: 300 })
    expect(edit?.after.sections).toBeUndefined()
  })

  it('leaves boards outside the section and in sub-sections where they are', () => {
    const names = (sectionTidyEdits(section, boards, { mode: 'column', gap: 10 })?.after.boards ?? []).map(
      (item) => item.name,
    )
    expect(names).not.toContain('out')
    expect(names).not.toContain('sub')
  })

  it('stores the wrap layout and puts the old one back on undo', () => {
    const edit = sectionTidyEdits(section, boards, { mode: 'wrap', gap: 40, width: 260 })
    expect(edit?.after.sections?.set?.[0]).toMatchObject({ id: 's1', layout: { mode: 'wrap', gap: 40 } })
    expect(edit?.before.sections?.set?.[0]).toMatchObject({ id: 's1', layout: null })
  })

  it('clears the layout for any other mode', () => {
    const laid = { ...section, layout: { mode: 'wrap' as const, gap: 20 } }
    const edit = sectionTidyEdits(laid, boards, { mode: 'row', gap: 20 })
    expect(edit?.after.sections?.set?.[0]).toMatchObject({ layout: null })
    expect(edit?.before.sections?.set?.[0]).toMatchObject({ layout: { mode: 'wrap', gap: 20 } })
  })

  it('stores the area given with a resize', () => {
    const edit = sectionTidyEdits(section, boards, {
      mode: 'wrap',
      gap: 40,
      width: 300,
      area: { x: 0, y: 0, width: 428, height: 500 },
    })
    expect(edit?.after.sections?.set?.[0]).toMatchObject({ x: 0, y: 0, width: 428, height: 500 })
    expect(edit?.before.sections?.set?.[0]).toMatchObject({ x: null, width: null })
  })

  it('uses the requested grid columns', () => {
    const edit = sectionTidyEdits(section, boards, { mode: 'grid', gap: 10, columns: 3 })
    expect(geometry(edit)).toEqual({ c: [210, 20], a: [320, 20] })
    const two = sectionTidyEdits(section, boards, { mode: 'grid', gap: 10, rows: 2 })
    expect(Object.keys(geometry(two)).length).toBeGreaterThan(0)
  })

  it('is null for a section with no direct board, or when nothing changes', () => {
    expect(sectionTidyEdits({ id: 's2', title: 'Two', parent: 's1' }, [board('x', 0, 0, 's1')], { mode: 'row', gap: 40 })).toBeNull()
    const tidy = [board('a', 0, 0, 's1'), board('b', 140, 0, 's1')]
    expect(sectionTidyEdits(section, tidy, { mode: 'row', gap: 40 })).toBeNull()
  })
})

describe('clearLayoutEdits', () => {
  it('lists only sections with a layout', () => {
    const laid = { id: 's1', title: 'One', layout: { mode: 'wrap' as const, gap: 40 } }
    expect(clearLayoutEdits([section])).toBeNull()
    expect(clearLayoutEdits([laid, section])?.after.sections?.set).toEqual([
      { id: 's1', title: 'One', layout: null },
    ])
  })
})
