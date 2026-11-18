import { describe, expect, it } from 'vitest'
import {
  addGroup,
  moveGroup,
  movePage,
  normalize,
  renameGroup,
  toggleGroup,
  ungroup,
  type PageGroups,
} from '../src/canvas/page-groups'

const state: PageGroups = {
  groups: [
    { id: 'g1', title: 'One', collapsed: false, pages: ['a', 'b'] },
    { id: 'g2', title: 'Two', collapsed: true, pages: ['c'] },
  ],
  loose: ['d', 'e'],
}

describe('normalize', () => {
  it('puts every page in loose for invalid input', () => {
    for (const bad of [null, undefined, 'x', 4, [], {}]) {
      expect(normalize(bad, ['a', 'b'])).toEqual({ groups: [], loose: ['a', 'b'] })
    }
  })

  it('keeps a valid state', () => {
    expect(normalize(state, ['a', 'b', 'c', 'd', 'e'])).toEqual(state)
  })

  it('drops stale ids and duplicates, first wins', () => {
    const stored = {
      groups: [{ id: 'g1', title: 'One', collapsed: false, pages: ['a', 'gone', 'a'] }],
      loose: ['a', 'b', 'b'],
    }
    expect(normalize(stored, ['a', 'b'])).toEqual({
      groups: [{ id: 'g1', title: 'One', collapsed: false, pages: ['a'] }],
      loose: ['b'],
    })
  })

  it('appends missing pages to loose in page order', () => {
    const stored = { groups: [], loose: ['c'] }
    expect(normalize(stored, ['a', 'b', 'c', 'd']).loose).toEqual(['c', 'a', 'b', 'd'])
  })

  it('drops malformed groups', () => {
    const stored = {
      groups: [
        null,
        { id: 1, title: 'x', collapsed: false, pages: [] },
        { id: 'g', title: '  ', collapsed: false, pages: ['a'] },
        { id: 'g', title: 'x', collapsed: 'no', pages: ['a'] },
        { id: 'ok', title: 'Ok', collapsed: false, pages: ['a'] },
        { id: 'ok', title: 'Dup', collapsed: false, pages: [] },
      ],
      loose: 'nope',
    }
    expect(normalize(stored, ['a', 'b'])).toEqual({
      groups: [{ id: 'ok', title: 'Ok', collapsed: false, pages: ['a'] }],
      loose: ['b'],
    })
  })
})

describe('addGroup and renameGroup', () => {
  it('appends an open empty group with a trimmed title', () => {
    const next = addGroup(state, '  New ', 'g3')
    expect(next.groups[2]).toEqual({ id: 'g3', title: 'New', collapsed: false, pages: [] })
  })

  it('ignores an empty title', () => {
    expect(addGroup(state, '   ', 'g3')).toBe(state)
    expect(renameGroup(state, 'g1', ' ')).toBe(state)
  })

  it('renames with a trimmed title', () => {
    expect(renameGroup(state, 'g1', ' Renamed ').groups[0]?.title).toBe('Renamed')
  })
})

describe('toggleGroup', () => {
  it('flips collapsed', () => {
    expect(toggleGroup(state, 'g1').groups[0]?.collapsed).toBe(true)
    expect(toggleGroup(state, 'g2').groups[1]?.collapsed).toBe(false)
  })
})

describe('ungroup', () => {
  it('removes the group and appends its pages to loose in order', () => {
    expect(ungroup(state, 'g1')).toEqual({
      groups: [state.groups[1]],
      loose: ['d', 'e', 'a', 'b'],
    })
  })
})

describe('movePage', () => {
  it('reorders inside a list', () => {
    expect(movePage(state, 'b', { group: 'g1', before: 'a' }).groups[0]?.pages).toEqual(['b', 'a'])
    expect(movePage(state, 'd', { group: null, before: null }).loose).toEqual(['e', 'd'])
  })

  it('moves across lists', () => {
    const next = movePage(state, 'a', { group: null, before: 'e' })
    expect(next.groups[0]?.pages).toEqual(['b'])
    expect(next.loose).toEqual(['d', 'a', 'e'])
    const into = movePage(state, 'd', { group: 'g2', before: null })
    expect(into.groups[1]?.pages).toEqual(['c', 'd'])
    expect(into.loose).toEqual(['e'])
  })

  it('appends when before is not in the target list', () => {
    expect(movePage(state, 'a', { group: 'g2', before: 'zzz' }).groups[1]?.pages).toEqual(['c', 'a'])
  })

  it('is unchanged when dropped before itself or into an unknown group', () => {
    expect(movePage(state, 'a', { group: 'g1', before: 'a' })).toBe(state)
    expect(movePage(state, 'a', { group: 'nope', before: null })).toBe(state)
  })
})

describe('moveGroup', () => {
  it('places a group before another or at the end', () => {
    expect(moveGroup(state, 'g2', 'g1').groups.map((g) => g.id)).toEqual(['g2', 'g1'])
    expect(moveGroup(state, 'g1', null).groups.map((g) => g.id)).toEqual(['g2', 'g1'])
  })

  it('is unchanged before itself or for an unknown group', () => {
    expect(moveGroup(state, 'g1', 'g1')).toBe(state)
    expect(moveGroup(state, 'nope', null)).toBe(state)
  })
})
