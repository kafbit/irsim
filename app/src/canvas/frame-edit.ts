import type { CanvasEdit } from '../lib/canvas-layout'
import type { Rect, Size } from './geometry'

export const MIN_W = 240
export const MIN_H = 160

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN: Size = { width: MIN_W, height: MIN_H }

/** `rect` shifted by `(dx, dy)` world units, rounded to integers. */
export const moveRect = (rect: Rect, dx: number, dy: number): Rect => ({
  x: Math.round(rect.x + dx),
  y: Math.round(rect.y + dy),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
})

/**
 * `rect` with the edges named by `handle` dragged by `(dx, dy)` world units. The opposite edges stay
 * fixed. A dragged edge stops at `min` from the fixed one instead of crossing it. Integer result.
 */
export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  min: Size = MIN,
): Rect {
  let left = Math.round(rect.x)
  let top = Math.round(rect.y)
  let right = left + Math.round(rect.width)
  let bottom = top + Math.round(rect.height)
  if (handle.includes('w')) left = Math.min(Math.round(left + dx), right - min.width)
  if (handle.includes('e')) right = Math.max(Math.round(right + dx), left + min.width)
  if (handle.includes('n')) top = Math.min(Math.round(top + dy), bottom - min.height)
  if (handle.includes('s')) bottom = Math.max(Math.round(bottom + dy), top + min.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export type Move = { name: string; rect: Rect; before: Rect }

const KEYS = ['x', 'y', 'width', 'height'] as const

/** The fields of `to` that differ from `from`. */
function changed(from: Rect, to: Rect): Partial<Rect> {
  const diff: Partial<Rect> = {}
  for (const key of KEYS) if (from[key] !== to[key]) diff[key] = to[key]
  return diff
}

/**
 * The edit that applies `moves` and the edit that reverts them. Each holds only the fields that
 * changed, so undoing a move does not rewrite the size of the board.
 */
export function editsOf(moves: Move[]): { before: CanvasEdit; after: CanvasEdit } {
  return {
    before: { boards: moves.map(({ name, rect, before }) => ({ name, ...changed(rect, before) })) },
    after: { boards: moves.map(({ name, rect, before }) => ({ name, ...changed(before, rect) })) },
  }
}
