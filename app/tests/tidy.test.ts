import { describe, expect, it } from 'vitest'
import { tidy } from '../src/canvas/tidy'

const frame = (name: string, x: number, y: number, width = 100, height = 50) => ({ name, x, y, width, height })
const at = (map: Map<string, { x: number; y: number }>, name: string) => map.get(name)
const origin = { x: 10, y: 20 }

describe('tidy', () => {
  it('row: one line in reading order with tops aligned', () => {
    const frames = [frame('c', 500, 0), frame('a', 0, 3), frame('b', 200, 8, 100, 80)]
    const result = tidy(frames, origin, { mode: 'row', gap: 10 })
    expect(at(result, 'a')).toEqual({ x: 10, y: 20 })
    expect(at(result, 'b')).toEqual({ x: 120, y: 20 })
    expect(at(result, 'c')).toEqual({ x: 230, y: 20 })
  })

  it('reads lower frames after upper ones, left to right inside a line', () => {
    const frames = [frame('d', 0, 300), frame('b', 300, 0), frame('a', 0, 5), frame('c', 150, 200)]
    const result = tidy(frames, origin, { mode: 'column', gap: 0 })
    expect([...result.keys()]).toEqual(['a', 'b', 'c', 'd'])
  })

  it('column: one column with lefts aligned', () => {
    const frames = [frame('a', 0, 0, 100, 50), frame('b', 0, 100, 200, 70)]
    const result = tidy(frames, origin, { mode: 'column', gap: 10 })
    expect(at(result, 'a')).toEqual({ x: 10, y: 20 })
    expect(at(result, 'b')).toEqual({ x: 10, y: 80 })
  })

  it('wrap: breaks before a frame that would pass the width and uses the tallest height', () => {
    const frames = [frame('a', 0, 0, 100, 50), frame('b', 200, 0, 100, 90), frame('c', 400, 0, 100, 50)]
    const result = tidy(frames, origin, { mode: 'wrap', gap: 10, width: 230 })
    expect(at(result, 'a')).toEqual({ x: 10, y: 20 })
    expect(at(result, 'b')).toEqual({ x: 120, y: 20 })
    expect(at(result, 'c')).toEqual({ x: 10, y: 120 })
  })

  it('wrap: puts at least one frame on each line', () => {
    const frames = [frame('a', 0, 0, 500), frame('b', 600, 0, 500)]
    const result = tidy(frames, origin, { mode: 'wrap', gap: 10, width: 100 })
    expect(at(result, 'a')).toEqual({ x: 10, y: 20 })
    expect(at(result, 'b')).toEqual({ x: 10, y: 80 })
  })

  it('grid: sizes cells by the widest and tallest frame and defaults columns to ceil(sqrt(n))', () => {
    const frames = [
      frame('a', 0, 0, 100, 50),
      frame('b', 200, 0, 300, 50),
      frame('c', 0, 200, 100, 120),
      frame('d', 200, 200, 100, 50),
      frame('e', 0, 400, 100, 50),
    ]
    const result = tidy(frames, origin, { mode: 'grid', gap: 10 })
    expect(at(result, 'a')).toEqual({ x: 10, y: 20 })
    expect(at(result, 'b')).toEqual({ x: 120, y: 20 })
    expect(at(result, 'c')).toEqual({ x: 430, y: 20 })
    expect(at(result, 'd')).toEqual({ x: 10, y: 150 })
    expect(at(result, 'e')).toEqual({ x: 120, y: 150 })
  })

  it('grid: columns override and extra frames continue in more rows', () => {
    const frames = ['a', 'b', 'c', 'd', 'e'].map((name, index) => frame(name, index * 200, 0))
    const result = tidy(frames, origin, { mode: 'grid', gap: 0, columns: 2, rows: 1 })
    expect(at(result, 'e')).toEqual({ x: 10, y: 120 })
  })

  it('rounds to integers', () => {
    const result = tidy([frame('a', 0, 0)], { x: 1.4, y: 2.6 }, { mode: 'row', gap: 0 })
    expect(at(result, 'a')).toEqual({ x: 1, y: 3 })
  })
})
