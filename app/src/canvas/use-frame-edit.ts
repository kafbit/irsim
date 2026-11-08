'use client'

import { type PointerEvent as ReactPointerEvent, useCallback } from 'react'
import type { Camera } from './camera'
import { type Handle, moveRect, resizeRect } from './frame-edit'
import type { PlacedBoard, Rect } from './geometry'

const DRAG_THRESHOLD = 3
const CLICK_GUARD_MS = 50

type Options = {
  camera: Camera
  boards: PlacedBoard[]
  enabled: boolean
  onSelect: (name: string) => void
  onPreview: (name: string, rect: Rect | null) => void
  onCommit: (name: string, rect: Rect, before: Rect) => void
}

type Gesture = {
  element: HTMLElement
  event: { pointerId: number; clientX: number; clientY: number }
  name: string
  start: Rect
  threshold: number
  apply: (dx: number, dy: number) => Rect
}

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height })
const same = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** The click that ends a drag would select the frame again. Swallow it once, and only for a moment. */
function swallowClick() {
  const stop = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', stop, true), CLICK_GUARD_MS)
}

/**
 * Moving a frame by its title and resizing it by a handle. Both are one gesture on one element
 * with pointer capture: the screen delta divided by the zoom at press time is the world delta. A
 * press that stays under 3 px is a click, so the title still selects. Esc or a cancelled pointer
 * restores the start rect. `onPreview` runs at most once per animation frame.
 */
export function useFrameEdit({ camera, boards, enabled, onSelect, onPreview, onCommit }: Options) {
  const run = useCallback(
    ({ element, event, name, start, threshold, apply }: Gesture) => {
      const k = camera.view.k || 1
      let dragging = threshold === 0
      let current = start
      let frame = 0

      const finish = (keep: boolean) => {
        cancelAnimationFrame(frame)
        element.removeEventListener('pointermove', move)
        element.removeEventListener('pointerup', up)
        element.removeEventListener('pointercancel', cancel)
        element.removeEventListener('lostpointercapture', cancel)
        window.removeEventListener('keydown', key, true)
        if (element.hasPointerCapture(event.pointerId))
          element.releasePointerCapture(event.pointerId)
        if (!dragging) return
        if (threshold > 0) swallowClick()
        if (keep && !same(current, start)) onCommit(name, current, rectOf(start))
        else onPreview(name, null)
      }
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return
        const dx = next.clientX - event.clientX
        const dy = next.clientY - event.clientY
        if (!dragging) {
          if (Math.hypot(dx, dy) < threshold) return
          dragging = true
          onSelect(name)
          camera.focusViewport()
        }
        current = apply(dx / k, dy / k)
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0
            onPreview(name, current)
          })
        }
      }
      const up = () => finish(true)
      const cancel = () => finish(false)
      const key = (next: KeyboardEvent) => {
        if (next.key !== 'Escape') return
        next.stopPropagation()
        finish(false)
      }

      element.setPointerCapture(event.pointerId)
      element.addEventListener('pointermove', move)
      element.addEventListener('pointerup', up)
      element.addEventListener('pointercancel', cancel)
      element.addEventListener('lostpointercapture', cancel)
      window.addEventListener('keydown', key, true)
    },
    [camera, onCommit, onPreview, onSelect],
  )

  /** `pointerdown` on the world layer: starts a move when it lands on a frame title in the Move tool. */
  const onTitleDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return
      const target = event.target as HTMLElement
      const element = target.closest<HTMLElement>('[data-frame-title]')
      const name = element?.closest('[data-board]')?.getAttribute('data-board')
      const board = boards.find((candidate) => candidate.name === name)
      if (!element || !board) return
      run({
        element,
        event,
        name: board.name,
        start: rectOf(board),
        threshold: DRAG_THRESHOLD,
        apply: (dx, dy) => moveRect(board, dx, dy),
      })
    },
    [boards, enabled, run],
  )

  const onResizeDown = useCallback(
    (name: string, handle: Handle, event: ReactPointerEvent<HTMLElement>) => {
      const board = boards.find((candidate) => candidate.name === name)
      if (!board || event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      camera.focusViewport()
      run({
        element: event.currentTarget,
        event,
        name,
        start: rectOf(board),
        threshold: 0,
        apply: (dx, dy) => resizeRect(board, handle, dx, dy),
      })
    },
    [boards, camera, run],
  )

  return { onTitleDown, onResizeDown }
}
