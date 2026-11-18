import { describe, expect, it } from 'vitest'
import type { ApprovalState } from '../src/canvas/approvals/use-approvals'
import { canvasMenuGroups, menuGroups, pendingNames } from '../src/canvas/context-menu-model'

const boards = [
  { name: 'A', interactive: true },
  { name: 'B' },
  { name: 'C', section: 's1' },
  { name: 'D', section: 's1' },
  { name: 'V', variantOf: 'A' },
]
const sections = [{ id: 's1', title: 'One' }]
const states: Record<string, ApprovalState> = { A: 'new', B: 'changed', C: 'approved', D: 'new' }
const stateOf = (name: string) => states[name]

const ids = (groups: ReturnType<typeof menuGroups>) => groups.map((group) => group.map((i) => i.id))
const run = (over: Partial<Parameters<typeof menuGroups>[0]>) =>
  menuGroups({
    names: ['A'],
    boards,
    sections,
    stateOf,
    connected: true,
    wholeSection: null,
    ...over,
  })

describe('menuGroups', () => {
  it('lists the items of one frame', () => {
    const groups = run({})
    expect(ids(groups)).toEqual([['copy'], ['play', 'comment'], ['variants', 'approve']])
    expect(groups[0]?.[0]?.label).toBe('Copy frame name')
  })

  it('hides the agent items with no session', () => {
    expect(ids(run({ connected: false }))).toEqual([['copy'], ['play', 'comment']])
  })

  it('hides Play for a board that is not interactive and approve for an approved one', () => {
    expect(ids(run({ names: ['C'] }))).toEqual([['copy'], ['comment'], ['variants']])
  })

  it('hides Generate variants on a variant board', () => {
    expect(ids(run({ names: ['V'] }))).toEqual([['copy'], ['comment']])
  })

  it('lists several frames with no section', () => {
    const groups = run({ names: ['A', 'B'] })
    expect(ids(groups)).toEqual([['copy'], ['approve'], ['create-section']])
    expect(groups[0]?.[0]?.label).toBe('Copy 2 frame names')
    expect(groups[1]?.[0]?.label).toBe('Approve 2 and build')
    expect(groups[2]?.[0]?.shortcut).toBe('Shift+S')
  })

  it('hides approve when no frame is pending', () => {
    expect(ids(run({ names: ['C', 'V'] }))).toEqual([['copy'], ['create-section', 'remove-from-section']])
  })

  it('lists a whole section', () => {
    const groups = run({ names: ['C', 'D'], wholeSection: 's1' })
    expect(ids(groups)).toEqual([
      ['copy'],
      ['approve'],
      ['tidy'],
      ['rename-section', 'create-sub-section', 'remove-from-section', 'delete-section'],
    ])
    expect(groups[3]?.[3]?.danger).toBe(true)
    expect(groups[1]?.[0]?.label).toBe('Approve 1 and build')
  })

  it('gives Tidy a submenu of four layouts with notes on Wrap and Grid', () => {
    const tidy = run({ names: ['C', 'D'], wholeSection: 's1' })[2]?.[0]
    expect(tidy?.children?.map((child) => child.id)).toEqual([
      'tidy-row',
      'tidy-column',
      'tidy-wrap',
      'tidy-grid',
    ])
    expect(tidy?.children?.[2]?.note).toBe('Reflows when the section is resized')
    expect(tidy?.children?.[3]?.note).toBe('Opens the controls in the right sidebar')
  })

  it('hides Tidy when the section holds only sub-sections', () => {
    const nested = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', parent: 's1' }]
    const tree = [{ name: 'C', section: 's2' }]
    const whole = run({ names: ['C'], boards: tree, sections: nested, wholeSection: 's1', connected: false })
    expect(ids(whole).flat()).not.toContain('tidy')
  })

  it('puts Show on canvas first in the sidebar, for a frame and a section only', () => {
    expect(ids(run({ sidebar: true, connected: false }))[0]).toEqual(['show-on-canvas'])
    expect(ids(run({ names: ['C', 'D'], wholeSection: 's1', sidebar: true, connected: false }))[0]).toEqual([
      'show-on-canvas',
    ])
    expect(ids(run({ names: ['A', 'B'], sidebar: true }))[0]).toEqual(['copy'])
    expect(ids(run({ connected: false })).flat()).not.toContain('show-on-canvas')
  })

  it('drops Create sub-section when the section cannot nest', () => {
    const deep = [
      { id: 's1', title: 'One' },
      { id: 's2', title: 'Two', parent: 's1' },
      { id: 's3', title: 'Three', parent: 's2' },
    ]
    const tree = [{ name: 'C', section: 's3' }, { name: 'D', section: 's3' }]
    const whole = run({ names: ['C', 'D'], boards: tree, sections: deep, wholeSection: 's3' })
    expect(ids(whole).at(-1)).toEqual(['rename-section', 'remove-from-section', 'delete-section'])
  })

  it('drops Create sub-section and Remove from section when every board is in a sub-section', () => {
    const nested = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', parent: 's1' }]
    const tree = [{ name: 'C', section: 's2' }, { name: 'D', section: 's2' }]
    const whole = run({ names: ['C', 'D'], boards: tree, sections: nested, wholeSection: 's1' })
    expect(ids(whole).at(-1)).toEqual(['rename-section', 'delete-section'])
  })

  it('keeps both items when a section has a direct board and a sub-section board', () => {
    const nested = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', parent: 's1' }]
    const tree = [{ name: 'C', section: 's1' }, { name: 'D', section: 's2' }]
    const whole = run({ names: ['C', 'D'], boards: tree, sections: nested, wholeSection: 's1' })
    expect(ids(whole).at(-1)).toEqual([
      'rename-section',
      'create-sub-section',
      'remove-from-section',
      'delete-section',
    ])
  })

  it('lists part of a section', () => {
    expect(ids(run({ names: ['C', 'D'], connected: false })).at(-1)).toEqual([
      'create-sub-section',
      'remove-from-section',
    ])
  })

  it('lists a mix of a section member and a frame outside it', () => {
    expect(ids(run({ names: ['B', 'C'], connected: false })).at(-1)).toEqual([
      'create-section',
      'remove-from-section',
    ])
  })
})

describe('canvasMenuGroups', () => {
  it('lists the page items, with the agent items only when connected', () => {
    const ids = (groups: ReturnType<typeof canvasMenuGroups>) => groups.map((group) => group.map((i) => i.id))
    expect(ids(canvasMenuGroups({ connected: true, sidebarShown: true }))).toEqual([
      ['copy-page-name', 'copy-page-link'],
      ['select-all', 'zoom-fit', 'zoom-100', 'toggle-sidebar'],
      ['rename-page', 'change-icon'],
      ['reorganize', 'choose-icon'],
    ])
    expect(ids(canvasMenuGroups({ connected: false, sidebarShown: true })).length).toBe(3)
  })

  it('names the sidebar item by its state and shows the real shortcuts', () => {
    const items = canvasMenuGroups({ connected: false, sidebarShown: false })[1] ?? []
    expect(items.map((item) => item.shortcut)).toEqual(['Ctrl+A', 'Shift+1', 'Shift+0', 'Ctrl+\\'])
    expect(items[3]?.label).toBe('Show sidebar')
    expect(canvasMenuGroups({ connected: false, sidebarShown: true })[1]?.[3]?.label).toBe('Hide sidebar')
  })
})

describe('pendingNames', () => {
  it('keeps the new and changed names', () => {
    expect(pendingNames(['A', 'B', 'C', 'V'], stateOf)).toEqual(['B', 'A'])
  })
})
