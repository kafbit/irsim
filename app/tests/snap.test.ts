import { describe, expect, it } from 'vitest'
import { MIN_W } from '../src/canvas/frame-edit'
import { tuneMove, tuneResize } from '../src/canvas/snap'

const options = { step: 0, snap: true, threshold: 6 }
const other = { x: 1000, y: 0, width: 400, height: 300 }

describe('tuneMove', () => {
  it('rounds the bounds origin to the grid step', () => {
    const result = tuneMove([{ x: 130, y: 61, width: 400, height: 300 }], [], {
      ...options,
      step: 24,
    })
    expect(result).toEqual({ dx: -10, dy: 11, guides: [] })
  })

  it('snaps the left edge to the right edge of another frame and spans both frames', () => {
    const moved = { x: 1403, y: 500, width: 200, height: 100 }
    const result = tuneMove([moved], [other], options)
    expect(result.dx).toBe(-3)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([{ axis: 'x', at: 1400, from: 0, to: 600 }])
  })

  it('does not snap beyond the threshold', () => {
    const result = tuneMove([{ x: 1410, y: 500, width: 200, height: 100 }], [other], options)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('shifts several moved rects as one group by their bounds', () => {
    const moved = [
      { x: 1503, y: 500, width: 100, height: 100 },
      { x: 1203, y: 700, width: 100, height: 100 },
    ]
    const result = tuneMove(moved, [other], options)
    expect(result.dx).toBe(-3)
  })

  it('lets a snapped line win over the step', () => {
    const near = { x: 1010, y: 0, width: 400, height: 300 }
    const result = tuneMove([{ x: 1003, y: 500, width: 200, height: 100 }], [near], {
      ...options,
      step: 24,
    })
    expect(result.dx).toBe(7)
  })

  it('returns no guides when snapping is off', () => {
    const result = tuneMove([{ x: 1403, y: 500, width: 200, height: 100 }], [other], {
      ...options,
      snap: false,
    })
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})

describe('tuneResize', () => {
  it('snaps the dragged right edge to another right edge and returns a guide', () => {
    const resized = { x: 0, y: 500, width: 1403, height: 200 }
    const result = tuneResize(resized, 'e', [other], options)
    expect(result.rect).toEqual({ x: 0, y: 500, width: 1400, height: 200 })
    expect(result.guides).toEqual([{ axis: 'x', at: 1400, from: 0, to: 700 }])
  })

  it('does not drop below the minimum width when snapping would cross', () => {
    const near = { x: -100, y: 0, width: 100, height: 100 }
    const resized = { x: 0, y: 0, width: MIN_W + 3, height: 200 }
    const result = tuneResize(resized, 'e', [{ ...near, x: -100 + MIN_W - 100 }], options)
    expect(result.rect.width).toBeGreaterThanOrEqual(MIN_W)
  })

  it('leaves the fixed edges untouched', () => {
    const resized = { x: 17, y: 503, width: 1403, height: 203 }
    const result = tuneResize(resized, 'e', [other], options)
    expect(result.rect.x).toBe(17)
    expect(result.rect.y).toBe(503)
    expect(result.rect.height).toBe(203)
  })
})
