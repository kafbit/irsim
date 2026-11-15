import { describe, expect, it } from 'vitest'
import { editsOf, type Handle, MIN_H, MIN_W, moveRect, resizeRect } from '../src/canvas/frame-edit'
import { buildPageLayout, layoutOf } from '../src/canvas/geometry'

const rect = { x: 100, y: 200, width: 400, height: 300 }

describe('moveRect', () => {
  it('shifts the origin and keeps the size', () => {
    expect(moveRect(rect, 30, -50)).toEqual({ x: 130, y: 150, width: 400, height: 300 })
  })

  it('rounds to integers', () => {
    expect(moveRect(rect, 0.4, 0.6)).toEqual({ x: 100, y: 201, width: 400, height: 300 })
  })
})

describe('resizeRect', () => {
  const cases: [Handle, Partial<typeof rect>][] = [
    ['e', { width: 450 }],
    ['w', { x: 150, width: 350 }],
    ['s', { height: 350 }],
    ['n', { y: 250, height: 250 }],
    ['se', { width: 450, height: 350 }],
    ['sw', { x: 150, width: 350, height: 350 }],
    ['ne', { width: 450, y: 250, height: 250 }],
    ['nw', { x: 150, width: 350, y: 250, height: 250 }],
  ]
  it.each(cases)('handle %s moves only its edges', (handle, expected) => {
    expect(resizeRect(rect, handle, 50, 50)).toEqual({ ...rect, ...expected })
  })

  it('ignores the axis a side handle does not control', () => {
    expect(resizeRect(rect, 'e', 50, 999)).toEqual({ ...rect, width: 450 })
    expect(resizeRect(rect, 'n', 999, 50)).toEqual({ ...rect, y: 250, height: 250 })
  })

  it('stops the dragged edge at the minimum instead of flipping', () => {
    expect(resizeRect(rect, 'e', -1000, 0)).toEqual({ ...rect, width: MIN_W })
    expect(resizeRect(rect, 's', 0, -1000)).toEqual({ ...rect, height: MIN_H })
    expect(resizeRect(rect, 'w', 1000, 0)).toEqual({ ...rect, x: 500 - MIN_W, width: MIN_W })
    expect(resizeRect(rect, 'n', 0, 1000)).toEqual({ ...rect, y: 500 - MIN_H, height: MIN_H })
    expect(resizeRect(rect, 'nw', 1000, 1000)).toEqual({
      x: 500 - MIN_W,
      y: 500 - MIN_H,
      width: MIN_W,
      height: MIN_H,
    })
  })

  it('keeps the opposite edge fixed', () => {
    const resized = resizeRect(rect, 'nw', -70, -20)
    expect(resized.x + resized.width).toBe(500)
    expect(resized.y + resized.height).toBe(500)
  })

  it('rounds to integers', () => {
    expect(resizeRect(rect, 'se', 10.4, 10.6)).toEqual({ ...rect, width: 410, height: 311 })
  })

  it('uses the minimum it is given', () => {
    expect(resizeRect(rect, 'e', -1000, 0, { width: 50, height: 50 })).toEqual({
      ...rect,
      width: 50,
    })
  })
})

describe('layoutOf', () => {
  const board = (name: string, x: number, y: number, width: number, height: number) => ({
    name,
    title: name,
    hash: '',
    x,
    y,
    width,
    height,
  })

  it('reaches over the page label and the far edges', () => {
    const layout = layoutOf([board('A', 0, 0, 100, 50), board('B', 200, 300, 100, 100)])
    expect(layout.all).toEqual({ x: 0, y: -208, width: 300, height: 608 })
  })

  it('grows to a board moved below zero', () => {
    const layout = layoutOf([board('A', -500, 0, 100, 50)])
    expect(layout.all.x).toBe(-500)
    expect(layout.all.width).toBe(500)
  })

  it('is what buildPageLayout returns', () => {
    const manifest = {
      id: 'p',
      title: 'P',
      boards: [{ ...board('A', 10, 20, 300, 200), closure: ['A'] }],
    }
    expect(buildPageLayout(manifest)).toEqual(layoutOf([board('A', 10, 20, 300, 200)]))
  })
})

describe('editsOf', () => {
  it('holds only the changed fields, forward and back', () => {
    const moved = { ...rect, x: 130, y: 150 }
    expect(editsOf([{ name: 'A', rect: moved, before: rect }])).toEqual({
      before: { boards: [{ name: 'A', x: 100, y: 200 }] },
      after: { boards: [{ name: 'A', x: 130, y: 150 }] },
    })
  })

  it('keeps the size fields of a resize', () => {
    const resized = { ...rect, width: 450 }
    const { before, after } = editsOf([{ name: 'A', rect: resized, before: rect }])
    expect(before.boards).toEqual([{ name: 'A', width: 400 }])
    expect(after.boards).toEqual([{ name: 'A', width: 450 }])
  })
})
