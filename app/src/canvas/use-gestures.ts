'use client'

import { type PointerEvent, useCallback, useRef } from 'react'
import type { Camera } from './camera'
import { wheelView } from './wheel'

const DRAG_THRESHOLD = 3
const DOUBLE_TAP_MS = 350

type Drag = { sx: number; sy: number; vx: number; vy: number; moved: boolean; board: string | null }

type Options = {
  camera: Camera
  hand: boolean
  onTap: (board: string | null, double: boolean) => void
}

const boardOf = (target: EventTarget) =>
  (target as HTMLElement).closest('[data-board]')?.getAttribute('data-board') ?? null

/**
 * Drag-to-pan, wheel pan, wheel and pinch zoom, and tap detection for the viewport. Everything
 * writes through the `Camera`; a pointer or wheel input ends a running animation. In hand mode
 * (the Hand tool or Space held) a tap does nothing and a drag may start on a frame label.
 */
export function useGestures({ camera, hand, onTap }: Options) {
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
  const lastTap = useRef<{ board: string; at: number } | null>(null)

  const syncMode = useCallback(
    (panning: boolean) => {
      camera.setBlocked(panning || space.current)
      camera.setCursor(panning ? 'grabbing' : space.current ? 'grab' : '')
    },
    [camera],
  )

  const wheelRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const rect = element.getBoundingClientRect()
        camera.move(
          wheelView(camera.view, event, event.clientX - rect.left, event.clientY - rect.top),
        )
      }
      element.addEventListener('wheel', onWheel, { passive: false })
      return () => element.removeEventListener('wheel', onWheel)
    },
    [camera],
  )

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const onLabel = (event.target as HTMLElement).closest('[data-frame-title], [data-pin]')
    if (onLabel && !hand && event.button === 0) return
    event.preventDefault()
    camera.focusViewport()
    camera.stop()
    const { x, y } = camera.view
    drag.current = {
      sx: event.clientX,
      sy: event.clientY,
      vx: x,
      vy: y,
      moved: false,
      board: boardOf(event.target),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.sx
    const dy = event.clientY - current.sy
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!current.moved) {
      current.moved = true
      window.getSelection()?.removeAllRanges()
      syncMode(true)
    }
    camera.move({ ...camera.view, x: current.vx + dx, y: current.vy + dy })
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!current) return
    syncMode(false)
    if (current.moved) return camera.settle()
    if (hand || event.type === 'pointercancel') return
    const now = performance.now()
    const previous = lastTap.current
    const double =
      current.board !== null &&
      previous?.board === current.board &&
      now - previous.at < DOUBLE_TAP_MS
    lastTap.current = double || current.board === null ? null : { board: current.board, at: now }
    onTap(current.board, double)
  }

  const setSpace = useCallback(
    (held: boolean) => {
      if (held) camera.stop()
      space.current = held
      syncMode(Boolean(drag.current?.moved))
    },
    [camera, syncMode],
  )

  return {
    wheelRef,
    setSpace,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
