'use client'

import { type PointerEvent, type RefObject, useCallback, useRef } from 'react'
import type { Camera } from './camera'
import { type Rect, zoomAt } from './geometry'
import { paintMarquee, rectBetween } from './marquee'
import { type WheelInput, wheelView } from './wheel'

const DRAG_THRESHOLD = 3
const DOUBLE_TAP_MS = 350

type Drag = {
  sx: number
  sy: number
  wx: number
  wy: number
  px: number
  py: number
  vx: number
  vy: number
  moved: boolean
  board: string | null
  mode: 'pan' | 'marquee'
  tappable: boolean
  additive: boolean
}

type Options = {
  camera: Camera
  hand: boolean
  /** True in the Move tool: a left-button mouse drag draws the selection rectangle instead of panning. */
  marquee: boolean
  marqueeRef: RefObject<HTMLDivElement | null>
  onTap: (board: string | null, double: boolean, additive: boolean) => void
  /** `rect` is in world units, `null` when the drag ends. `start` is true on the first call of a drag. */
  onMarquee: (rect: Rect | null, additive: boolean, start: boolean) => void
}

const boardOf = (target: EventTarget) =>
  (target as HTMLElement).closest('[data-board]')?.getAttribute('data-board') ?? null

/**
 * Selection rectangle, drag-to-pan, wheel pan, wheel and pinch zoom, and tap detection for the
 * viewport. In the Move tool a left-button mouse drag draws the selection rectangle. Space with the
 * left button, the middle button, one finger on touch, and the Hand tool pan. Panning writes
 * through the `Camera`; a pointer or wheel input ends a running animation. When panning with the
 * Hand tool or Space, a tap does nothing and a drag may start on a frame label.
 */
export function useGestures({ camera, hand, marquee, marqueeRef, onTap, onMarquee }: Options) {
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
  const dragged = useRef(false)
  const lastTap = useRef<{ board: string; at: number } | null>(null)
  const viewportBox = useRef<HTMLElement | null>(null)
  const marqueeFrame = useRef(0)

  const cancelMarquee = () => {
    cancelAnimationFrame(marqueeFrame.current)
    marqueeFrame.current = 0
  }

  const requestMarquee = () => {
    const current = drag.current
    if (!current || current.mode !== 'marquee' || !current.moved || marqueeFrame.current) return
    marqueeFrame.current = requestAnimationFrame(() => {
      marqueeFrame.current = 0
      const active = drag.current
      const element = viewportBox.current
      if (!active || active.mode !== 'marquee' || !element) return
      const { x, y, k } = camera.view
      const box = element.getBoundingClientRect()
      const rect = rectBetween(
        active.wx * k + x,
        active.wy * k + y,
        active.px - box.left,
        active.py - box.top,
      )
      paintMarquee(marqueeRef.current, rect)
      onMarquee(
        {
          x: (rect.x - x) / k,
          y: (rect.y - y) / k,
          width: rect.width / k,
          height: rect.height / k,
        },
        active.additive,
        !dragged.current,
      )
      dragged.current = true
    })
  }

  const syncMode = useCallback(
    (panning: boolean) => {
      camera.setBlocked(panning || space.current)
      camera.setCursor(panning ? 'grabbing' : space.current ? 'grab' : '')
    },
    [camera],
  )

  const wheelRef = useCallback(
    (element: HTMLDivElement | null) => {
      viewportBox.current = element
      if (!element) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const rect = element.getBoundingClientRect()
        camera.move(
          wheelView(camera.view, event, event.clientX - rect.left, event.clientY - rect.top),
        )
        requestMarquee()
      }
      const blockPageZoom = (event: WheelEvent) => event.ctrlKey && event.preventDefault()
      const onFrameWheel = (event: MessageEvent) => {
        const data = event.data as { type?: string; board?: unknown; details?: WheelInput } | null
        if (data?.type !== 'wheel' || typeof data.board !== 'string' || !data.details) return
        const frame = element.querySelector<HTMLIFrameElement>(
          `[data-board="${CSS.escape(data.board)}"] iframe`,
        )
        if (!frame || event.source !== frame.contentWindow) return
        const box = frame.getBoundingClientRect()
        const scale = frame.offsetWidth ? box.width / frame.offsetWidth : 1
        const rect = element.getBoundingClientRect()
        const px = box.left + (data.details.clientX ?? 0) * scale - rect.left
        const py = box.top + (data.details.clientY ?? 0) * scale - rect.top
        camera.move(wheelView(camera.view, data.details, px, py))
        requestMarquee()
      }
      let startK = 1
      const onGestureStart = (event: Event) => {
        event.preventDefault()
        startK = camera.view.k
      }
      const onGestureChange = (event: Event) => {
        event.preventDefault()
        const { scale, clientX, clientY } = event as Event & {
          scale: number
          clientX: number
          clientY: number
        }
        const rect = element.getBoundingClientRect()
        camera.move(zoomAt(camera.view, startK * scale, clientX - rect.left, clientY - rect.top))
        requestMarquee()
      }
      element.addEventListener('gesturestart', onGestureStart)
      element.addEventListener('gesturechange', onGestureChange)
      element.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('wheel', blockPageZoom, { passive: false })
      window.addEventListener('message', onFrameWheel)
      return () => {
        element.removeEventListener('gesturestart', onGestureStart)
        element.removeEventListener('gesturechange', onGestureChange)
        element.removeEventListener('wheel', onWheel)
        window.removeEventListener('wheel', blockPageZoom)
        window.removeEventListener('message', onFrameWheel)
      }
    },
    [camera, marqueeRef, onMarquee],
  )

  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; k: number } | null>(null)
  const touchDistance = () => {
    const [a, b] = [...touches.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.current.size === 2) {
        drag.current = null
        pinch.current = { distance: touchDistance(), k: camera.view.k }
      }
    }
    if (event.button !== 0 && event.button !== 1) return
    const onLabel = (event.target as HTMLElement).closest('[data-frame-title], [data-pin]')
    if (onLabel && !hand && event.button === 0) return
    const panning =
      hand || !marquee || space.current || event.button === 1 || event.pointerType === 'touch'
    dragged.current = false
    event.preventDefault()
    camera.focusViewport()
    camera.stop()
    const { x, y, k } = camera.view
    const box = event.currentTarget.getBoundingClientRect()
    drag.current = {
      sx: event.clientX,
      sy: event.clientY,
      wx: (event.clientX - box.left - x) / k,
      wy: (event.clientY - box.top - y) / k,
      px: event.clientX,
      py: event.clientY,
      vx: x,
      vy: y,
      moved: false,
      board: boardOf(event.target),
      mode: panning ? 'pan' : 'marquee',
      tappable: event.button === 0 && !hand && !space.current,
      additive: event.shiftKey,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch.current && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = touchDistance() / pinch.current.distance
        camera.move(
          zoomAt(
            camera.view,
            pinch.current.k * ratio,
            (a.x + b.x) / 2 - rect.left,
            (a.y + b.y) / 2 - rect.top,
          ),
        )
        return
      }
    }
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.sx
    const dy = event.clientY - current.sy
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!current.moved) {
      current.moved = true
      window.getSelection()?.removeAllRanges()
      if (current.mode === 'marquee') camera.setBlocked(true)
      else syncMode(true)
    }
    if (current.mode === 'marquee') {
      current.px = event.clientX
      current.py = event.clientY
      requestMarquee()
      return
    }
    camera.move({ ...camera.view, x: current.vx + dx, y: current.vy + dy })
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId)
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null
      drag.current = null
      syncMode(false)
      return camera.settle()
    }
    const current = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!current) return
    syncMode(false)
    if (current.mode === 'marquee' && current.moved) {
      cancelMarquee()
      paintMarquee(marqueeRef.current, null)
      dragged.current = false
      onMarquee(null, current.additive, false)
      return
    }
    if (current.moved) return camera.settle()
    if (!current.tappable || event.type === 'pointercancel') return
    const now = performance.now()
    const previous = lastTap.current
    const double =
      current.board !== null &&
      previous?.board === current.board &&
      now - previous.at < DOUBLE_TAP_MS
    lastTap.current = double || current.board === null ? null : { board: current.board, at: now }
    onTap(current.board, double, current.additive)
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
