import { describe, expect, it } from 'vitest'
import { boardsInRect, boundsOf } from '../src/canvas/geometry'
import { rectBetween } from '../src/canvas/marquee'

const boards = [
  { name: 'A', x: 0, y: 0, width: 100, height: 100 },
  { name: 'B', x: 200, y: 0, width: 100, height: 100 },
  { name: 'C', x: 0, y: 200, width: 100, height: 100 },
]

describe('boardsInRect', () => {
  it('selects a board the rectangle only touches by overlap', () => {
    expect(boardsInRect({ x: 90, y: 90, width: 20, height: 20 }, boards)).toEqual(['A'])
  })

  it('selects every board it crosses, in board order', () => {
    expect(boardsInRect({ x: 50, y: -10, width: 200, height: 50 }, boards)).toEqual(['A', 'B'])
    expect(boardsInRect({ x: -10, y: -10, width: 400, height: 400 }, boards)).toEqual([
      'A',
      'B',
      'C',
    ])
  })

  it('selects nothing in the gaps, and not for a shared edge', () => {
    expect(boardsInRect({ x: 120, y: 120, width: 40, height: 40 }, boards)).toEqual([])
    expect(boardsInRect({ x: 100, y: 0, width: 50, height: 50 }, boards)).toEqual([])
  })
})

describe('rectBetween', () => {
  it('orders the corners whichever way the drag went', () => {
    expect(rectBetween(50, 60, 10, 20)).toEqual({ x: 10, y: 20, width: 40, height: 40 })
  })
})

describe('boundsOf', () => {
  it('holds every rect, and is null for none', () => {
    expect(boundsOf(boards)).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    expect(boundsOf([])).toBeNull()
  })
})
