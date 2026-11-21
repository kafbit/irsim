import { describe, expect, it } from 'vitest'
import { canvasMenuGroups, menuGroups } from '../src/canvas/context-menu-model'

const boards = [
  { name: 'A', interactive: true },
  { name: 'B' },
  { name: 'C', section: 's1' },
  { name: 'D', section: 's1' },
  { name: 'V', variantOf: 'A' },
]
const sections = [{ id: 's1', title: 'One' }]

const ids = (groups: ReturnType<typeof menuGroups>) => groups.map((group) => group.map((i) => i.id))
const run = (over: Partial<Parameters<typeof menuGroups>[0]>) =>
  menuGroups({
    names: ['A'],
    boards,
    sections,
    connected: true,
    wholeSection: null,
    ...over,
  })

describe('menuGroups', () => {
  it('lists the items of one frame', () => {
    const groups = run({})
    expect(ids(groups)).toEqual([['ask-agent', 'variants'], ['play', 'comment'], ['section', 'copy']])
    expect(groups[2]?.[1]?.children?.[0]?.label).toBe('Copy frame name')
    expect(groups[2]?.[0]?.children?.map((item) => item.id)).toEqual(['create-section'])
  })

  it('keeps Ask the agent disabled and hides Generate variants with no session', () => {
    const groups = run({ connected: false })
    expect(ids(groups)).toEqual([['ask-agent'], ['play', 'comment'], ['section', 'copy']])
    expect(groups[0]?.[0]?.disabled).toBe(true)
    expect(run({})[0]?.[0]?.disabled).toBe(false)
  })

  it('hides Play for a board that is not interactive', () => {
    expect(ids(run({ names: ['C'] }))[1]).toEqual(['comment'])
  })

  it('hides Generate variants on a variant board', () => {
    expect(ids(run({ names: ['V'] }))[0]).toEqual(['ask-agent'])
  })

  it('offers Remove from section for a frame in a section', () => {
    const groups = run({ names: ['C'] })
    expect(groups[2]?.[0]?.children?.map((item) => item.id)).toEqual(['remove-from-section'])
  })

  it('lists several frames with no section', () => {
    const groups = run({ names: ['A', 'B'] })
    expect(ids(groups)).toEqual([['ask-agent'], ['section', 'copy']])
    expect(groups[1]?.[1]?.children?.[0]?.label).toBe('Copy 2 frame names')
    expect(groups[1]?.[0]?.children?.[0]?.shortcut).toBe('Shift+S')
  })

  it('lists a whole section', () => {
    const groups = run({ names: ['C', 'D'], wholeSection: 's1' })
    expect(ids(groups)).toEqual([['ask-agent', 'reorganize'], ['arrange', 'section', 'copy']])
    const children = groups[1]?.[1]?.children
    expect(children?.map((item) => item.id)).toEqual(['create-sub-section', 'rename-section', 'delete-section'])
    expect(children?.[2]?.danger).toBe(true)
    expect(groups[1]?.[2]?.children?.[0]?.label).toBe('Copy section name')
  })

  it('disables Arrange for a section holding only sub-sections', () => {
    const nested = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', parent: 's1' }]
    const tree = [{ name: 'C', section: 's2' }]
    const whole = run({ names: ['C'], boards: tree, sections: nested, wholeSection: 's1', connected: false })
    expect(whole[1]?.[0]).toMatchObject({ id: 'arrange', disabled: true })
    expect(whole[1]?.[1]?.children?.map((item) => item.id)).toEqual(['rename-section', 'delete-section'])
  })

  it('puts Show on canvas first in the sidebar, for a frame and a section only', () => {
    expect(ids(run({ sidebar: true, connected: false }))[0]).toEqual(['show-on-canvas'])
    expect(ids(run({ names: ['C', 'D'], wholeSection: 's1', sidebar: true, connected: false }))[0]).toEqual([
      'show-on-canvas',
    ])
    expect(ids(run({ names: ['A', 'B'], sidebar: true }))[0]).toEqual(['ask-agent'])
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
    expect(whole.at(-1)?.[1]?.children?.map((item) => item.id)).toEqual(['rename-section', 'delete-section'])
  })

  it('keeps Create sub-section when a section has a direct board and a sub-section board', () => {
    const nested = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two', parent: 's1' }]
    const tree = [{ name: 'C', section: 's1' }, { name: 'D', section: 's2' }]
    const whole = run({ names: ['C', 'D'], boards: tree, sections: nested, wholeSection: 's1' })
    expect(whole.at(-1)?.[1]?.children?.map((item) => item.id)).toEqual([
      'create-sub-section',
      'rename-section',
      'delete-section',
    ])
  })

  it('lists part of a section', () => {
    expect(ids(run({ names: ['C', 'D'], connected: false })).at(-1)).toEqual(['section', 'copy'])
    expect(run({ names: ['C', 'D'], connected: false }).at(-1)?.[0]?.children?.map((item) => item.id)).toEqual([
      'create-sub-section',
      'remove-from-section',
    ])
  })

  it('lists a mix of a section member and a frame outside it', () => {
    expect(run({ names: ['B', 'C'], connected: false }).at(-1)?.[0]?.children?.map((item) => item.id)).toEqual([
      'create-section',
      'remove-from-section',
    ])
  })
})

describe('canvasMenuGroups', () => {
  const ids = (groups: ReturnType<typeof canvasMenuGroups>) => groups.map((group) => group.map((i) => i.id))

  it('lists the agent items, disabled with no session, then the Page and View submenus', () => {
    const connected = canvasMenuGroups({ connected: true, sidebarShown: true })
    expect(ids(connected)).toEqual([['ask-agent', 'reorganize', 'choose-icon'], ['page', 'view']])
    expect(connected[0]?.every((item) => !item.disabled)).toBe(true)
    expect(canvasMenuGroups({ connected: false, sidebarShown: true })[0]?.every((item) => item.disabled)).toBe(true)
    expect(connected[1]?.[0]?.children?.map((item) => item.id)).toEqual([
      'rename-page',
      'change-icon',
      'copy-page-name',
      'copy-page-link',
    ])
  })

  it('names the sidebar item by its state and shows the real shortcuts', () => {
    const items = canvasMenuGroups({ connected: false, sidebarShown: false })[1]?.[1]?.children ?? []
    expect(items.map((item) => item.shortcut)).toEqual(['Ctrl+A', 'Shift+1', 'Shift+0', 'Ctrl+\\'])
    expect(items[3]?.label).toBe('Show sidebar')
    expect(canvasMenuGroups({ connected: false, sidebarShown: true })[1]?.[1]?.children?.[3]?.label).toBe(
      'Hide sidebar',
    )
  })
})
