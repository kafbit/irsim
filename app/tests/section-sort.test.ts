import { describe, expect, it } from 'vitest'
import { byTitle, bySectionTitle } from '../src/canvas/sections'

describe('byTitle', () => {
  it('orders boards by title with numbers compared as numbers', () => {
    const boards = [
      { title: 'Card 10', name: 'a' },
      { title: 'card 2', name: 'b' },
      { title: 'Alpha', name: 'c' },
    ]
    expect(boards.sort(byTitle).map((board) => board.name)).toEqual(['c', 'b', 'a'])
  })

  it('breaks ties by board name', () => {
    const boards = [
      { title: 'Same', name: 'b' },
      { title: 'same', name: 'a' },
    ]
    expect(boards.sort(byTitle).map((board) => board.name)).toEqual(['a', 'b'])
  })
})

describe('bySectionTitle', () => {
  it('orders sections by title', () => {
    const sections = [{ title: 'Reports' }, { title: 'checkout' }]
    expect(sections.sort(bySectionTitle).map((section) => section.title)).toEqual(['checkout', 'Reports'])
  })
})
