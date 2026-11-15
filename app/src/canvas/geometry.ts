import type { PageManifest } from './types'

export const MIN_SCALE = 0.02
export const MAX_SCALE = 2
export const TITLE_BAR = 48
export const PAGE_LABEL_ROOM = 160

export type View = { x: number; y: number; k: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type PlacedBoard = Rect & {
  name: string
  title: string
  hash: string
  interactive?: boolean
  fill?: boolean
  section?: string | undefined
  unchanged?: boolean | undefined
}
export type Layout = { boards: PlacedBoard[]; all: Rect }

export const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k))

/** The extents of `boards`. `all` reaches up over the page label and frame titles, and out to a board moved below zero. */
export function layoutOf(boards: PlacedBoard[]): Layout {
  let left = 0
  let right = 0
  let top = -(TITLE_BAR + PAGE_LABEL_ROOM)
  let bottom = 0
  for (const board of boards) {
    left = Math.min(left, board.x)
    right = Math.max(right, board.x + board.width)
    top = Math.min(top, board.y - TITLE_BAR - PAGE_LABEL_ROOM)
    bottom = Math.max(bottom, board.y + board.height)
  }
  return { boards, all: { x: left, y: top, width: right - left, height: bottom - top } }
}

/** Positions come from the manifest, already page-local. */
export function buildPageLayout(manifest: PageManifest): Layout {
  return layoutOf(
    manifest.boards.map(({ name, title, x, y, width, height, hash, interactive, fill, section, unchanged }) => ({
      name,
      title,
      hash,
      interactive,
      fill,
      x,
      y,
      width,
      height,
      ...(section === undefined ? {} : { section }),
      ...(unchanged === undefined ? {} : { unchanged }),
    })),
  )
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

/**
 * The view that centres `rect` on screen. It zooms in no further than actual size, or than the
 * current zoom `k` when that is larger, and zooms out only as far as `rect` needs to fit.
 */
export function focusRect(rect: Rect, size: Size, k: number, padding = 96): View {
  const fit = fitRect(rect, size, padding)
  const next = Math.min(fit.k, clampScale(Math.max(k, 1)))
  if (next === fit.k) return fit
  return {
    k: next,
    x: size.width / 2 - (rect.x + rect.width / 2) * next,
    y: size.height / 2 - (rect.y + rect.height / 2) * next,
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

/** The names of the boards `rect` touches, in board order. Boards that only share an edge are not touched. */
export function boardsInRect(rect: Rect, boards: (Rect & { name: string })[]): string[] {
  return boards.filter((board) => intersects(rect, board)).map((board) => board.name)
}

/** The smallest rectangle that holds every rect in `rects`, or `null` for none. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
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
