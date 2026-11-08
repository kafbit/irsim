import type { PlacedBoard, Rect, Size, View } from './geometry'

export const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2]
export const LABELS_MIN_SCALE = 0.05
export const GRID_FADE_FROM = 0.1
const GRID_BASE = 24
const GRID_MIN_SCREEN = 12

/** The next zoom step above (`1`) or below (`-1`) `k`. Stays at the end step when there is none. */
export function stepZoom(k: number, direction: 1 | -1): number {
  const epsilon = 1e-6
  const first = ZOOM_STEPS[0] as number
  const last = ZOOM_STEPS[ZOOM_STEPS.length - 1] as number
  if (direction === 1) return ZOOM_STEPS.find((step) => step > k + epsilon) ?? last
  return [...ZOOM_STEPS].reverse().find((step) => step < k - epsilon) ?? first
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

export const lerpView = (from: View, to: View, t: number): View => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  k: from.k + (to.k - from.k) * t,
})

export const sameView = (a: View, b: View): boolean => a.x === b.x && a.y === b.y && a.k === b.k

/** Boards sorted top to bottom, then start to end, which is how the canvas is read. */
export function readingOrder(boards: PlacedBoard[]): string[] {
  return [...boards].sort((a, b) => a.y - b.y || a.x - b.x).map((board) => board.name)
}

/** The board after (`1`) or before (`-1`) `current`, wrapping. With no current, the first or the last. */
export function adjacentBoard(order: string[], current: string | null, direction: 1 | -1) {
  if (order.length === 0) return null
  const at = current === null ? -1 : order.indexOf(current)
  if (at < 0) return (direction === 1 ? order[0] : order[order.length - 1]) ?? null
  return order[(at + direction + order.length) % order.length] ?? null
}

/**
 * The dot grid for a view: its spacing in screen pixels, the offset of the dots, and the opacity.
 * The spacing grows by 4 whenever it would fall under 12 px; the opacity is 0 at 0.05 and below,
 * 1 from 0.1 up.
 */
export function gridOf(view: View) {
  let size = GRID_BASE * view.k
  while (size < GRID_MIN_SCREEN) size *= 4
  const alpha = Math.min(
    1,
    Math.max(0, (view.k - LABELS_MIN_SCALE) / (GRID_FADE_FROM - LABELS_MIN_SCALE)),
  )
  return { size, x: view.x - size / 2, y: view.y - size / 2, alpha }
}

export type MinimapMap = { scale: number; width: number; height: number; origin: Rect }

/** Fits the world rect `all` into a panel of `width` px, at most `maxHeight` px tall, with `pad` px around it. */
export function minimapMap(all: Rect, width: number, maxHeight: number, pad = 4): MinimapMap {
  const scale = Math.min(
    (width - pad * 2) / Math.max(all.width, 1),
    (maxHeight - pad * 2) / Math.max(all.height, 1),
  )
  return { scale, width, height: Math.round(all.height * scale + pad * 2), origin: all }
}

/** A screen rect, relative to the panel, for a world rect. */
export function toMinimap(map: MinimapMap, rect: Rect, pad = 4): Rect {
  return {
    x: (rect.x - map.origin.x) * map.scale + pad,
    y: (rect.y - map.origin.y) * map.scale + pad,
    width: rect.width * map.scale,
    height: rect.height * map.scale,
  }
}

/** The world point under the panel point `(px, py)`. */
export function fromMinimap(map: MinimapMap, px: number, py: number, pad = 4) {
  return { x: (px - pad) / map.scale + map.origin.x, y: (py - pad) / map.scale + map.origin.y }
}

/** The view with the world point `(wx, wy)` at the centre of the viewport, keeping the zoom. */
export const centerOn = (view: View, size: Size, wx: number, wy: number): View => ({
  k: view.k,
  x: size.width / 2 - wx * view.k,
  y: size.height / 2 - wy * view.k,
})
