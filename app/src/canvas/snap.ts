import { type Handle, MIN_H, MIN_W } from './frame-edit'
import { boundsOf, type Rect } from './geometry'

export const SNAP_DISTANCE = 6

export type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number }
export type TuneOptions = { step: number; snap: boolean; threshold: number }

const MATCH = 0.5

type Axis = 'x' | 'y'

const start = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.x : rect.y)
const length = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.width : rect.height)
const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x')

function linesOf(rect: Rect, axis: Axis): number[] {
  const from = start(rect, axis)
  const size = length(rect, axis)
  return [from, from + size / 2, from + size]
}

function nearest(lines: number[], rects: Rect[], axis: Axis, threshold: number) {
  let best: { delta: number; to: number } | null = null
  for (const rect of rects) {
    for (const candidate of linesOf(rect, axis)) {
      for (const line of lines) {
        const delta = candidate - line
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, to: candidate }
        }
      }
    }
  }
  return best
}

function guideAt(axis: Axis, at: number, subject: Rect, others: Rect[]): Guide {
  const across = other(axis)
  const matched = others.filter((rect) => linesOf(rect, axis).some((line) => Math.abs(line - at) <= MATCH))
  const group = [subject, ...matched]
  return {
    axis,
    at,
    from: Math.min(...group.map((rect) => start(rect, across))),
    to: Math.max(...group.map((rect) => start(rect, across) + length(rect, across))),
  }
}

function guidesFor(axis: Axis, lines: number[], subject: Rect, others: Rect[]): Guide[] {
  const found = new Map<number, Guide>()
  for (const line of lines) {
    for (const rect of others) {
      for (const candidate of linesOf(rect, axis)) {
        if (Math.abs(candidate - line) > MATCH) continue
        const at = Math.round(candidate)
        if (!found.has(at)) found.set(at, guideAt(axis, candidate, subject, others))
      }
    }
  }
  return [...found.values()]
}

/** The extra integer shift for `moved` (already shifted by the raw pointer delta) that lands the group on the grid step or on a line of `others`, with the guides of the matched lines. */
export function tuneMove(
  moved: Rect[],
  others: Rect[],
  options: TuneOptions,
): { dx: number; dy: number; guides: Guide[] } {
  const bounds = boundsOf(moved)
  if (!bounds) return { dx: 0, dy: 0, guides: [] }
  const { step, snap, threshold } = options
  let dx = step > 0 ? Math.round(bounds.x / step) * step - bounds.x : 0
  let dy = step > 0 ? Math.round(bounds.y / step) * step - bounds.y : 0
  const snapping = snap && others.length > 0
  if (snapping) {
    const x = nearest(linesOf({ ...bounds, x: bounds.x + dx }, 'x'), others, 'x', threshold)
    if (x) dx += x.delta
    const y = nearest(linesOf({ ...bounds, y: bounds.y + dy }, 'y'), others, 'y', threshold)
    if (y) dy += y.delta
  }
  dx = Math.round(dx)
  dy = Math.round(dy)
  if (!snap) return { dx, dy, guides: [] }
  const final = { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
  return {
    dx,
    dy,
    guides: [
      ...guidesFor('x', linesOf(final, 'x'), final, others),
      ...guidesFor('y', linesOf(final, 'y'), final, others),
    ],
  }
}

/** `resized` with its dragged edges moved onto the grid step and onto lines of `others`, never below the minimum size, with the guides of the snapped edges. */
export function tuneResize(
  resized: Rect,
  handle: Handle,
  others: Rect[],
  options: TuneOptions,
): { rect: Rect; guides: Guide[] } {
  const { step, snap, threshold } = options
  const snapping = snap && others.length > 0
  const snapped = new Set<'left' | 'right' | 'top' | 'bottom'>()
  const tune = (value: number, axis: Axis, edge: 'left' | 'right' | 'top' | 'bottom') => {
    let v = step > 0 ? Math.round(value / step) * step : value
    if (snapping) {
      const hit = nearest([v], others, axis, threshold)
      if (hit) {
        v = hit.to
        snapped.add(edge)
      }
    }
    return v
  }
  let left = resized.x
  let top = resized.y
  let right = resized.x + resized.width
  let bottom = resized.y + resized.height
  if (handle.includes('w')) left = tune(left, 'x', 'left')
  if (handle.includes('e')) right = tune(right, 'x', 'right')
  if (handle.includes('n')) top = tune(top, 'y', 'top')
  if (handle.includes('s')) bottom = tune(bottom, 'y', 'bottom')
  if (handle.includes('w') && left > right - MIN_W) {
    left = right - MIN_W
    snapped.delete('left')
  }
  if (handle.includes('e') && right < left + MIN_W) {
    right = left + MIN_W
    snapped.delete('right')
  }
  if (handle.includes('n') && top > bottom - MIN_H) {
    top = bottom - MIN_H
    snapped.delete('top')
  }
  if (handle.includes('s') && bottom < top + MIN_H) {
    bottom = top + MIN_H
    snapped.delete('bottom')
  }
  left = Math.round(left)
  right = Math.round(right)
  top = Math.round(top)
  bottom = Math.round(bottom)
  const rect = { x: left, y: top, width: right - left, height: bottom - top }
  const edges = { left, right, top, bottom }
  const guides = [...snapped].map((edge) =>
    guideAt(edge === 'left' || edge === 'right' ? 'x' : 'y', edges[edge], rect, others),
  )
  return { rect, guides }
}
