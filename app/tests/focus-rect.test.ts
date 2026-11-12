import { describe, expect, it } from 'vitest'
import { fitRect, focusRect } from '../src/canvas/geometry'

const viewport = { width: 1000, height: 600 }

describe('focusRect', () => {
  it('centres a small element at actual size when the view is zoomed out', () => {
    const view = focusRect({ x: 2000, y: 1000, width: 100, height: 40 }, viewport, 0.1)
    expect(view.k).toBe(1)
    expect(2050 * view.k + view.x).toBe(500)
    expect(1020 * view.k + view.y).toBe(300)
  })

  it('keeps a larger zoom than actual size for a small element', () => {
    expect(focusRect({ x: 0, y: 0, width: 50, height: 50 }, viewport, 2).k).toBe(2)
  })

  it('zooms out until an element larger than the viewport fits', () => {
    const rect = { x: 100, y: 100, width: 3000, height: 2000 }
    expect(focusRect(rect, viewport, 1)).toEqual(fitRect(rect, viewport, 96))
  })
})
