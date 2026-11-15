import { describe, expect, it } from 'vitest'
import { applyEdit, type CanvasEdit, type CanvasFile } from '../src/lib/canvas-layout'
import {
  applySectionEdit,
  assignEdits,
  createSectionEdits,
  defaultTitle,
  deleteSectionEdits,
  initialSectionState,
  newSectionId,
  placedSections,
  sectionBounds,
  sharedSection,
  withMembership,
} from '../src/canvas/sections'

const board = (name: string, x: number, y: number, section?: string) => ({
  name,
  x,
  y,
  width: 300,
  height: 200,
  ...(section ? { section } : {}),
})

describe('sectionBounds', () => {
  const boards = [board('A', 100, 200, 's'), board('B', 500, 300, 's'), board('C', 0, 0)]
  it('pads the member bounds and adds nothing for the label', () => {
    expect(sectionBounds({ id: 's', title: 'S' }, boards)).toEqual({
      x: 100 - 64,
      y: 200 - 48 - 64,
      width: 700 + 128,
      height: 348 + 128,
    })
  })
  it('is null and not drawn without members', () => {
    expect(sectionBounds({ id: 'x', title: 'X' }, boards)).toBeNull()
    expect(
      placedSections(
        [
          { id: 'x', title: 'X' },
          { id: 's', title: 'S' },
        ],
        boards,
      ),
    ).toHaveLength(1)
  })
})

describe('nested sections', () => {
  const sections = [
    { id: 'child', title: 'Child', parent: 'top' },
    { id: 'top', title: 'Top', color: 'blue' as const },
  ]
  const boards = [board('A', 0, 0, 'child'), board('B', 1000, 0, 'top')]
  it('holds the child area with a margin and draws parents first', () => {
    const placed = placedSections(sections, boards)
    expect(placed.map((item) => item.section.id)).toEqual(['top', 'child'])
    const [top, child] = placed
    expect(top!.bounds.x).toBeLessThan(child!.bounds.x)
    expect(top!.bounds.x + top!.bounds.width).toBeGreaterThan(child!.bounds.x + child!.bounds.width)
    expect(top!.members).toEqual(['A', 'B'])
    expect(child!.members).toEqual(['A'])
  })
  it('gives a sub-section its parent color', () => {
    expect(placedSections(sections, boards).map((item) => item.color)).toEqual(['blue', 'blue'])
  })
  it('makes a sub-section when the boards share a section', () => {
    const made = createSectionEdits(['A'], boards, sections)
    expect(made.section.parent).toBe('child')
    expect(createSectionEdits(['A', 'B'], boards, sections).section.parent).toBeUndefined()
  })
  it('stops at three levels', () => {
    const deep = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', parent: 'a' },
      { id: 'c', title: 'C', parent: 'b' },
    ]
    expect(createSectionEdits(['X'], [board('X', 0, 0, 'c')], deep).section.parent).toBeUndefined()
  })
})

describe('ids and titles', () => {
  it('picks the next free id and title', () => {
    expect(newSectionId([])).toBe('section-1')
    expect(newSectionId(['section-1', 'section-2'])).toBe('section-3')
    expect(newSectionId(['section-2'])).toBe('section-3')
    expect(defaultTitle([])).toBe('Section 1')
    expect(defaultTitle([{ id: 'a', title: 'Section 2' }])).toBe('Section 3')
  })
})

describe('applySectionEdit mirrors the server', () => {
  const canvas: CanvasFile = {
    pages: [
      {
        id: 'p',
        sections: [{ id: 'a', title: 'A' }],
        boards: [
          { name: 'X', x: 0, y: 0, width: 300, height: 200, section: 'a' },
          { name: 'Y', x: 0, y: 0, width: 300, height: 200 },
        ],
      },
    ],
  }
  const state = initialSectionState(
    [{ id: 'a', title: 'A' }],
    [{ name: 'X', section: 'a' }, { name: 'Y' }],
  )
  const serverState = (edit: CanvasEdit) => {
    const result = applyEdit(canvas, 'p', edit)
    if (!('canvas' in result)) throw new Error(result.error)
    const page = result.canvas.pages[0]!
    return {
      sections: page.sections,
      sectionOf: Object.fromEntries(
        page.boards.filter((b) => typeof b.section === 'string').map((b) => [b.name, b.section]),
      ),
    }
  }
  const edits: CanvasEdit[] = [
    { sections: { set: [{ id: 'b', title: 'B' }] }, boards: [{ name: 'Y', section: 'b' }] },
    { sections: { remove: ['a'] } },
    { sections: { set: [{ id: 'a', title: 'Renamed' }] } },
    { boards: [{ name: 'X', section: null }] },
  ]
  for (const edit of edits) {
    it(`matches applyEdit for ${JSON.stringify(edit)}`, () => {
      expect(applySectionEdit(state, edit)).toEqual(serverState(edit))
    })
  }
  it('keeps the object for a geometry edit', () => {
    expect(applySectionEdit(state, { boards: [{ name: 'X', x: 5 }] })).toBe(state)
  })
})

describe('edit builders', () => {
  const sections = [{ id: 'a', title: 'A', variantOf: 'V' }]
  const boards = [board('X', 0, 0, 'a'), board('Y', 0, 0)]
  const state = initialSectionState(sections, boards)

  it('create then revert restores membership', () => {
    const { section, before, after } = createSectionEdits(['X', 'Y'], boards, sections)
    expect(section).toEqual({ id: 'section-2', title: 'Section 2' })
    const created = applySectionEdit(state, after)
    expect(created.sectionOf).toEqual({ X: 'section-2', Y: 'section-2' })
    expect(applySectionEdit(created, before)).toEqual(state)
  })
  it('delete clears members and the revert brings them back', () => {
    const { before, after } = deleteSectionEdits(sections[0]!, boards)
    const deleted = applySectionEdit(state, after)
    expect(deleted).toEqual({ sections: [], sectionOf: {} })
    expect(applySectionEdit(deleted, before)).toEqual(state)
  })
  it('assign and revert', () => {
    const { before, after } = assignEdits(['X', 'Y'], boards, null)
    const cleared = applySectionEdit(state, after)
    expect(cleared.sectionOf).toEqual({})
    expect(applySectionEdit(cleared, before)).toEqual(state)
  })
  it('reads the shared section', () => {
    expect(sharedSection(['X'], boards)).toBe('a')
    expect(sharedSection(['Y'], boards)).toBeNull()
    expect(sharedSection(['X', 'Y'], boards)).toBeUndefined()
  })
  it('withMembership keeps agreeing boards', () => {
    const [x, y] = withMembership(boards, { Y: 'a' })
    expect(x).toEqual(board('X', 0, 0))
    expect(y?.section).toBe('a')
    expect(withMembership(boards, { X: 'a' })[0]).toBe(boards[0])
  })
})
