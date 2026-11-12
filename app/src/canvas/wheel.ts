import { type View, zoomAt } from './geometry'

export type WheelInput = {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  clientX?: number
  clientY?: number
}

const ZOOM_RATE = 0.01
const ZOOM_STEP_MAX = 24

/**
 * Ctrl, Cmd or a pinch zooms around the screen point `(px, py)`; anything else pans. Line-mode
 * deltas count 16 px. Chromium sends a pinch as ctrl+wheel with `deltaY = 100 * ln(scale)`, so
 * `ZOOM_RATE` makes the pinch follow the fingers; a mouse notch (100 to 120) is clamped to
 * `ZOOM_STEP_MAX`, about 27% per notch.
 */
export function wheelView(view: View, input: WheelInput, px: number, py: number): View {
  const unit = input.deltaMode === 1 ? 16 : 1
  if (input.ctrlKey || input.metaKey) {
    const delta = Math.max(-ZOOM_STEP_MAX, Math.min(ZOOM_STEP_MAX, input.deltaY * unit))
    return zoomAt(view, view.k * Math.exp(-delta * ZOOM_RATE), px, py)
  }
  return { ...view, x: view.x - input.deltaX * unit, y: view.y - input.deltaY * unit }
}
