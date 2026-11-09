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

/** Ctrl, Cmd or a pinch zooms around the screen point `(px, py)`; anything else pans. Line-mode deltas count 16 px. */
export function wheelView(view: View, input: WheelInput, px: number, py: number): View {
  const unit = input.deltaMode === 1 ? 16 : 1
  if (input.ctrlKey || input.metaKey) {
    return zoomAt(view, view.k * Math.exp(-input.deltaY * unit * 0.002), px, py)
  }
  return { ...view, x: view.x - input.deltaX * unit, y: view.y - input.deltaY * unit }
}
