import type { Ref } from 'react'
import type { Rect } from './geometry'

/** The selection rectangle while a drag on empty canvas runs. `paintMarquee` places it in viewport pixels. It does not take the pointer. */
export function Marquee({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      hidden
      aria-hidden="true"
      className="pointer-events-none absolute border border-ring bg-ring/8"
    />
  )
}

/** Places the rectangle without React, or hides it for `null`. */
export function paintMarquee(element: HTMLElement | null, rect: Rect | null) {
  if (!element) return
  if (!rect) {
    element.hidden = true
    return
  }
  element.style.left = `${rect.x}px`
  element.style.top = `${rect.y}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
  element.hidden = false
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
