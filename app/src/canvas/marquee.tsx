import type { Rect } from './geometry'

/** The selection rectangle while a drag on empty canvas runs. `rect` is in viewport pixels. It does not take the pointer. */
export function Marquee({ rect }: { rect: Rect | null }) {
  if (!rect) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute border border-ring bg-ring/8"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  )
}

/** The rectangle between two corners, whichever way the drag went. */
export function rectBetween(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(ax - bx),
    height: Math.abs(ay - by),
  }
}
