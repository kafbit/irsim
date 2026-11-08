import { describe, expect, it } from 'vitest'
import { type CanvasFile, placeBoard } from '../src/lib/canvas-layout'

const canvas = (): CanvasFile => ({
  version: 1,
  pages: [
    {
      id: 'sales',
      title: 'Sales',
      boards: [
        { name: 'Leads', title: 'Leads', x: 0, y: 0, width: 1440, height: 900 },
        { name: 'Pipeline', title: 'Pipeline', x: 1600, y: 0, width: 1440, height: 900 },
      ],
    },
    {
      id: 'admin',
      title: 'Admin',
      boards: [{ name: 'Leads', title: 'Leads', x: 5, y: 6, width: 300, height: 300 }],
    },
  ],
  overrides: { colors: { a: 'b' }, radius: {}, type: {} },
  bindings: { x: 'y' },
})

const placed = (result: ReturnType<typeof placeBoard>): CanvasFile => {
  if ('error' in result) throw new Error(result.error)
  return result.canvas
}

describe('placeBoard', () => {
  it('moves a board', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Leads', { x: 40, y: -20, width: 1440, height: 900 }),
    )
    expect(result.pages[0]?.boards[0]).toEqual({
      name: 'Leads',
      title: 'Leads',
      x: 40,
      y: -20,
      width: 1440,
      height: 900,
    })
  })

  it('resizes a board', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Pipeline', { x: 1600, y: 0, width: 800, height: 600 }),
    )
    expect(result.pages[0]?.boards[1]).toMatchObject({ width: 800, height: 600 })
  })

  it('rounds to integers', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Leads', { x: 10.4, y: 10.5, width: 500.49, height: 400.5 }),
    )
    expect(result.pages[0]?.boards[0]).toMatchObject({ x: 10, y: 11, width: 500, height: 401 })
  })

  it('accepts the minimum size and rejects anything smaller', () => {
    const ok = placeBoard(canvas(), 'sales', 'Leads', { x: 0, y: 0, width: 240, height: 160 })
    expect('canvas' in ok).toBe(true)
    for (const size of [
      { width: 239, height: 160 },
      { width: 240, height: 159 },
      { width: 239.4, height: 500 },
    ]) {
      expect(placeBoard(canvas(), 'sales', 'Leads', { x: 0, y: 0, ...size })).toMatchObject({
        status: 400,
      })
    }
  })

  it('rejects numbers that are not finite', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) {
      const rect = { x: 0, y: 0, width: 500, height: 500 }
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(placeBoard(canvas(), 'sales', 'Leads', { ...rect, [key]: bad })).toMatchObject({
          status: 400,
        })
      }
    }
  })

  it('answers 404 for an unknown page or board', () => {
    const rect = { x: 0, y: 0, width: 500, height: 500 }
    expect(placeBoard(canvas(), 'nope', 'Leads', rect)).toMatchObject({ status: 404 })
    expect(placeBoard(canvas(), 'sales', 'Nope', rect)).toMatchObject({ status: 404 })
    expect(placeBoard(canvas(), 'admin', 'Pipeline', rect)).toMatchObject({ status: 404 })
  })

  it('leaves every other board, page and key untouched, in the same order', () => {
    const before = canvas()
    const result = placed(
      placeBoard(before, 'sales', 'Leads', { x: 1, y: 2, width: 300, height: 300 }),
    )
    expect(result.pages[0]?.boards[1]).toEqual(before.pages[0]?.boards[1])
    expect(result.pages[1]).toEqual(before.pages[1])
    expect(result.overrides).toEqual(before.overrides)
    expect(result.bindings).toEqual(before.bindings)
    expect(Object.keys(result)).toEqual(Object.keys(before))
    expect(Object.keys(result.pages[0]?.boards[0] ?? {})).toEqual(
      Object.keys(before.pages[0]?.boards[0] ?? {}),
    )
  })

  it('does not mutate its input', () => {
    const before = canvas()
    placeBoard(before, 'sales', 'Leads', { x: 1, y: 2, width: 300, height: 300 })
    expect(before).toEqual(canvas())
  })
})
