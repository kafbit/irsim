'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { Camera, CameraListener } from '../camera'
import type { PlacedBoard } from '../geometry'
import { isWholeBoard } from '../../lib/place-text'
import { CommentForm } from './comment-form'
import { useGenerate } from './use-generate'
import { placedRect, placePanel, toScreen } from './model'
import type { PickedElement } from './types'

export const PANEL = { width: 320, height: 200 }
export const FLOATING = 'shadow-[0_14px_36px_rgba(20,22,26,0.14)]'
export const PANEL_CLASS = `absolute start-0 top-0 flex w-80 flex-col gap-2 rounded-xl border border-border bg-card p-3 ${FLOATING}`

/**
 * Highlights the picked rect and opens a comment box below it (above when there is no room). Both
 * follow the camera through `subscribe`, not through React. Save is Ctrl/Cmd+Enter, Cancel is Esc.
 */
export function Composer({
  camera,
  boards,
  pick,
  page,
  canVary = true,
  onSave,
  onSent,
  onCancel,
}: {
  camera: Camera
  boards: PlacedBoard[]
  pick: PickedElement
  page: string
  /** False for a board that is itself a variant: the Variants toggle is not offered. */
  canVary?: boolean
  onSave: (body: string, images: string[]) => Promise<void>
  onSent: (count: number) => void
  onCancel: () => void
}) {
  const frame = useMemo(() => boards.find((board) => board.name === pick.board), [boards, pick])
  const box = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const variants = useGenerate({ page, pick, onSent })

  // Syncs the two elements with the camera, an imperative external system; React never writes their geometry.
  useEffect(() => {
    let latest: { view: Parameters<CameraListener>[0]; size: Parameters<CameraListener>[1] } | null = null
    const place = () => {
      if (!latest || !frame || !box.current || !panel.current) return
      const rect = toScreen(frame, placedRect(frame, pick), latest.view)
      box.current.style.width = `${rect.width}px`
      box.current.style.height = `${rect.height}px`
      box.current.style.transform = `translate(${rect.x}px, ${rect.y}px)`
      const at = placePanel(rect, latest.size, {
        width: PANEL.width,
        height: panel.current.offsetHeight || PANEL.height,
      })
      panel.current.style.transform = `translate(${at.x}px, ${at.y}px)`
    }
    const unsubscribe = camera.subscribe((view, size) => {
      latest = { view, size }
      place()
    })
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    return () => {
      unsubscribe()
      observer.disconnect()
    }
  }, [camera, frame, pick])

  return (
    <>
      <div
        ref={box}
        aria-hidden="true"
        className={`outline-pick pointer-events-none absolute start-0 top-0 outline-2 ${
          isWholeBoard(pick) ? '-outline-offset-2' : ''
        }`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-label="New comment"
        className={PANEL_CLASS}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <CommentForm
          pick={pick}
          onSave={onSave}
          onGenerate={canVary ? variants.generate : undefined}
          canGenerate={variants.canGenerate}
          session={variants.session}
          onCancel={onCancel}
        />
      </div>
    </>
  )
}
