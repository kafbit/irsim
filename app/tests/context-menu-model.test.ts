import { describe, expect, it } from 'vitest'
import type { ApprovalState } from '../src/canvas/approvals/use-approvals'
import { menuGroups, pendingNames } from '../src/canvas/context-menu-model'

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
      ['rename-section', 'create-sub-section', 'remove-from-section', 'delete-section'],
    ])
    expect(groups[2]?.[3]?.danger).toBe(true)
    expect(groups[1]?.[0]?.label).toBe('Approve 1 and build')
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

describe('pendingNames', () => {
  it('keeps the new and changed names', () => {
    expect(pendingNames(['A', 'B', 'C', 'V'], stateOf)).toEqual(['B', 'A'])
  })
})
