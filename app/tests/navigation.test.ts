import { describe, expect, it } from 'vitest'
import type { PlacedBoard } from '../src/canvas/geometry'
import {
  adjacentBoard,
  centerOn,
  easeInOutCubic,
  fromMinimap,
  gridOf,
  lerpView,
  minimapMap,
  readingOrder,
  stepZoom,
  toMinimap,
  ZOOM_STEPS,
} from '../src/canvas/navigation'

const board = (name: string, x: number, y: number): PlacedBoard => ({
  name,
  title: name,
  hash: name,
  x,
  y,
  width: 100,
  height: 100,
})

describe('stepZoom', () => {
  it('the steps are exactly the documented ones', () => {
    expect(ZOOM_STEPS).toEqual([0.02, 0.05, 0.1, 0.25, 0.5, 1, 2])
  })

  it('moves to the next step above and below the current zoom', () => {
    expect(stepZoom(0.3, 1)).toBe(0.5)
    expect(stepZoom(0.3, -1)).toBe(0.25)
    expect(stepZoom(0.5, 1)).toBe(1)
    expect(stepZoom(0.5, -1)).toBe(0.25)
  })

  it('stays on the end steps', () => {
    expect(stepZoom(2, 1)).toBe(2)
    expect(stepZoom(0.02, -1)).toBe(0.02)
    expect(stepZoom(0.01, -1)).toBe(0.02)
    expect(stepZoom(3, -1)).toBe(2)
  })
})

describe('animation helpers', () => {
  it('easeInOutCubic starts at 0, ends at 1 and is 0.5 in the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25)
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75)
  })

  it('lerpView interpolates every field', () => {
    expect(lerpView({ x: 0, y: 10, k: 1 }, { x: 100, y: 30, k: 2 }, 0.5)).toEqual({
      x: 50,
      y: 20,
      k: 1.5,
    })
  })
})

describe('readingOrder and adjacentBoard', () => {
  const order = readingOrder([board('c', 0, 200), board('b', 200, 0), board('a', 0, 0)])

  it('sorts top to bottom, then start to end', () => {
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('steps forward and backward, wrapping', () => {
    expect(adjacentBoard(order, 'a', 1)).toBe('b')
    expect(adjacentBoard(order, 'c', 1)).toBe('a')
    expect(adjacentBoard(order, 'a', -1)).toBe('c')
  })

  it('with no selection starts at the first or the last', () => {
    expect(adjacentBoard(order, null, 1)).toBe('a')
    expect(adjacentBoard(order, null, -1)).toBe('c')
    expect(adjacentBoard([], null, 1)).toBeNull()
  })
})

describe('gridOf', () => {
  it('is fully visible from 0.1 and gone at 0.05', () => {
    expect(gridOf({ x: 0, y: 0, k: 0.1 }).alpha).toBe(1)
    expect(gridOf({ x: 0, y: 0, k: 1 }).alpha).toBe(1)
    expect(gridOf({ x: 0, y: 0, k: 0.05 }).alpha).toBe(0)
    expect(gridOf({ x: 0, y: 0, k: 0.075 }).alpha).toBeCloseTo(0.5)
  })

  it('multiplies the spacing by 4 until it reaches 12 px', () => {
    expect(gridOf({ x: 0, y: 0, k: 1 }).size).toBe(24)
    expect(gridOf({ x: 0, y: 0, k: 0.25 }).size).toBe(24)
    expect(gridOf({ x: 0, y: 0, k: 0.1 }).size).toBeCloseTo(9.6 * 4)
  })

  it('puts a dot at the world origin: the tile starts half a spacing before it', () => {
    const grid = gridOf({ x: 100, y: 50, k: 1 })
    expect(grid.x).toBe(100 - grid.size / 2)
    expect(grid.y).toBe(50 - grid.size / 2)
  })
})

describe('minimap geometry', () => {
  const all = { x: 0, y: -200, width: 4000, height: 2000 }
  const map = minimapMap(all, 200, 140)

  it('fits the page inside the panel', () => {
    expect(map.scale).toBeCloseTo(192 / 4000)
    expect(map.height).toBeLessThanOrEqual(140)
  })

  it('toMinimap and fromMinimap are inverse', () => {
    const rect = toMinimap(map, { x: 1000, y: 300, width: 400, height: 200 })
    const back = fromMinimap(map, rect.x, rect.y)
    expect(back.x).toBeCloseTo(1000)
    expect(back.y).toBeCloseTo(300)
  })

  it('centerOn puts the world point in the middle of the viewport', () => {
    const view = centerOn({ x: 0, y: 0, k: 0.5 }, { width: 800, height: 600 }, 1000, 400)
    expect(view).toEqual({ k: 0.5, x: 400 - 500, y: 300 - 200 })
  })
})
