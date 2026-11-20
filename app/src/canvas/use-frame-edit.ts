'use client'

import { type PointerEvent as ReactPointerEvent, useCallback } from 'react'
import type { Camera } from './camera'
import { type Handle, type Move, moveRect, resizeRect } from './frame-edit'
import type { PlacedBoard, Rect } from './geometry'
import { readMovePrefs } from './move-prefs'
import { type PlacedSection, sectionAt } from './sections'
import { type Guide, SNAP_DISTANCE, tuneMove, tuneResize } from './snap'

const DRAG_THRESHOLD = 3
const CLICK_GUARD_MS = 50

type Options = {
  camera: Camera
  boards: PlacedBoard[]
  enabled: boolean
  selected: string[]
  onSelect: (name: string) => void
  onPreview: (rects: Record<string, Rect> | null) => void
  onCommit: (moves: Move[], kind: 'move' | 'resize', drop?: { section: string | null }) => void
  /** The sections as they were when a drag started, to find the one a frame is dropped into. */
  dropAreas?: () => PlacedSection[]
  /** The section a dragged frame is over, `null` for none; `null` again when the drag ends. */
  onTarget?: (id: string | null) => void
  /** The snap lines of the frame being dragged, `[]` for none; `[]` again when the drag ends. */
  onGuides?: (guides: Guide[]) => void
}

type Gesture = {
  element: HTMLElement
  event: { pointerId: number; clientX: number; clientY: number }
  kind: 'move' | 'resize'
  handle?: Handle
  items: { name: string; start: Rect }[]
  selects: string | null
  /** The frame whose center decides the section it is dropped into; only a title drag has one. */
  drops: string | null
  threshold: number
  apply: (start: Rect, dx: number, dy: number) => Rect
}

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height })
const same = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const previewOf = (moves: Move[]) =>
  Object.fromEntries(moves.map(({ name, rect }) => [name, rect])) as Record<string, Rect>

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
 * Moving frames by a title and resizing one by a handle. Both are one gesture on one element
 * with pointer capture: the screen delta divided by the zoom at press time is the world delta. A
 * title that belongs to the selection moves every selected frame together. A press that stays
 * under 3 px is a click, so the title still selects. Esc or a cancelled pointer restores the start
 * rects. `onPreview` runs at most once per animation frame.
 */
export function useFrameEdit({
  camera,
  boards,
  enabled,
  selected,
  onSelect,
  onPreview,
  onCommit,
  dropAreas,
  onTarget,
  onGuides,
}: Options) {
  const run = useCallback(
    ({ element, event, kind, handle, items, selects, drops, threshold, apply }: Gesture) => {
      const k = camera.view.k || 1
      const prefs = readMovePrefs()
      const moving = new Set(items.map(({ name }) => name))
      const others = boards.filter(({ name }) => !moving.has(name)).map(rectOf)
      const tuning = { step: prefs.step, snap: prefs.snap, threshold: SNAP_DISTANCE / k }
      let guides: Guide[] = []
      const areas = drops !== null ? (dropAreas?.() ?? []) : []
      let target: string | null = null
      let dragging = threshold === 0
      let current: Move[] = items.map(({ name, start }) => ({ name, rect: start, before: start }))
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
        onTarget?.(null)
        onGuides?.([])
        const moved = current.filter(({ rect, before }) => !same(rect, before))
        if (keep && moved.length > 0) {
          if (drops !== null && dropAreas) onCommit(moved, kind, { section: target })
          else onCommit(moved, kind)
        } else onPreview(null)
      }
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return
        const dx = next.clientX - event.clientX
        const dy = next.clientY - event.clientY
        if (!dragging) {
          if (Math.hypot(dx, dy) < threshold) return
          dragging = true
          if (selects) onSelect(selects)
          camera.focusViewport()
        }
        const raw = items.map(({ name, start }) => ({
          name,
          rect: apply(start, dx / k, dy / k),
          before: start,
        }))
        const free = next.ctrlKey || next.metaKey
        if (free || (!prefs.snap && prefs.step === 0)) {
          current = raw
          guides = []
        } else if (kind === 'move') {
          const tuned = tuneMove(
            raw.map(({ rect }) => rect),
            others,
            tuning,
          )
          guides = tuned.guides
          current = raw.map((item) => ({
            ...item,
            rect: { ...item.rect, x: item.rect.x + tuned.dx, y: item.rect.y + tuned.dy },
          }))
        } else {
          const only = raw[0]
          if (only) {
            const tuned = tuneResize(only.rect, handle ?? 'se', others, tuning)
            guides = tuned.guides
            current = [{ ...only, rect: tuned.rect }]
          } else current = raw
        }
        const lead = current.find((item) => item.name === drops)
        if (lead && dropAreas) {
          const next = sectionAt(lead.rect, areas)
          if (next !== target) {
            target = next
            onTarget?.(next)
          }
        }
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0
            onPreview(previewOf(current))
            onGuides?.(guides)
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
    [boards, camera, dropAreas, onCommit, onGuides, onPreview, onSelect, onTarget],
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
      const together = selected.includes(board.name) && selected.length > 1
      const moving = together
        ? boards.filter((candidate) => selected.includes(candidate.name))
        : [board]
      run({
        element,
        event,
        kind: 'move',
        items: moving.map((candidate) => ({ name: candidate.name, start: rectOf(candidate) })),
        selects: selected.includes(board.name) ? null : board.name,
        drops: board.name,
        threshold: DRAG_THRESHOLD,
        apply: (start, dx, dy) => moveRect(start, dx, dy),
      })
    },
    [boards, enabled, run, selected],
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
        kind: 'resize',
        handle,
        items: [{ name, start: rectOf(board) }],
        selects: null,
        drops: null,
        threshold: 0,
        apply: (start, dx, dy) => resizeRect(start, handle, dx, dy),
      })
    },
    [boards, camera, run],
  )

  return { onTitleDown, onResizeDown }
}
