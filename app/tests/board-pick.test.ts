import { describe, expect, it } from 'vitest'
import { boardPick, placedRect } from '../src/canvas/comments/model'

describe('boardPick', () => {
  it('picks the whole frame as a board element on line 0', () => {
    expect(boardPick({ name: 'Leads', title: 'Leads table', width: 1280, height: 720 })).toEqual({
      board: 'Leads',
      file: 'design/Leads.dc.html',
      line: 0,
      element: { tag: 'board', path: '', text: 'Leads table' },
      rect: { x: 0, y: 0, width: 1280, height: 720 },
    })
  })

  it('falls back to the board name when the title is empty', () => {
    expect(boardPick({ name: 'Leads', title: '', width: 10, height: 10 }).element.text).toBe('Leads')
  })
})

describe('placedRect', () => {
  const stored = { x: 5, y: 6, width: 7, height: 8 }

  it('follows the current board size for a whole-board comment', () => {
    expect(placedRect({ width: 1000, height: 500 }, { line: 0, rect: stored })).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    })
  })

  it('keeps the stored rect for an element comment', () => {
    expect(placedRect({ width: 1000, height: 500 }, { line: 12, rect: stored })).toBe(stored)
  })
})
