import type { PageManifest } from './types'

export const MIN_SCALE = 0.02
export const MAX_SCALE = 2
export const TITLE_BAR = 48
export const PAGE_LABEL_ROOM = 160

export type View = { x: number; y: number; k: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type PlacedBoard = Rect & { name: string; title: string; hash: string }
export type Layout = { boards: PlacedBoard[]; all: Rect }

export const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k))

/** Positions come from the manifest, already page-local. `all` reaches up over the page label and frame titles. */
export function buildPageLayout(manifest: PageManifest): Layout {
  const boards = manifest.boards.map(({ name, title, x, y, width, height, hash }) => ({
    name,
    title,
    hash,
    x,
    y,
    width,
    height,
  }))
  let width = 0
  let height = 0
  for (const board of boards) {
    width = Math.max(width, board.x + board.width)
    height = Math.max(height, board.y + board.height)
  }
  const top = -(TITLE_BAR + PAGE_LABEL_ROOM)
  return { boards, all: { x: 0, y: top, width, height: height - top } }
}

/**
 * The view that shows `rect` centred, with `padding` screen pixels around it. At the minimum zoom a
 * rect can still be larger than the viewport; it is then aligned to the start edge, not centred.
 */
export function fitRect(rect: Rect, size: Size, padding = 48): View {
  const k = clampScale(
    Math.min(
      (size.width - padding * 2) / Math.max(rect.width, 1),
      (size.height - padding * 2) / Math.max(rect.height, 1),
    ),
  )
  const align = (space: number, content: number) =>
    content > space - padding * 2 ? padding : (space - content) / 2
  return {
    k,
    x: align(size.width, rect.width * k) - rect.x * k,
    y: align(size.height, rect.height * k) - rect.y * k,
  }
}

/** Zooms to `k` keeping the world point under the screen point `(px, py)` fixed. */
export function zoomAt(view: View, k: number, px: number, py: number): View {
  const next = clampScale(k)
  const ratio = next / view.k
  return { k: next, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }
}

export const zoomAtCenter = (view: View, k: number, size: Size): View =>
  zoomAt(view, k, size.width / 2, size.height / 2)

/** The world rectangle the viewport shows. */
export function visibleWorld(view: View, size: Size): Rect {
  return {
    x: -view.x / view.k,
    y: -view.y / view.k,
    width: size.width / view.k,
    height: size.height / view.k,
  }
}

export function intersects(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width > b.x - margin &&
    a.y < b.y + b.height + margin &&
    a.y + a.height > b.y - margin
  )
}

/** A board with the room its label takes above it. */
export const boardRegion = (board: Rect): Rect => ({
  x: board.x,
  y: board.y - TITLE_BAR,
  width: board.width,
  height: board.height + TITLE_BAR,
})

export const LABEL_MIN_WIDTH = 24

/**
 * The `max-inline-size` of a frame label, in layout pixels of the scaled world: the frame's screen
 * width (`--k` times its width). It falls to 0 once that screen width is under `LABEL_MIN_WIDTH`.
 */
export const labelMaxInline = (boardWidth: number): string =>
  `calc(var(--k, 1) * 100% * clamp(0, calc((var(--k, 1) * ${boardWidth} - ${LABEL_MIN_WIDTH - 1}) * 1000), 1))`
