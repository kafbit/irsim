'use client'

import { useEffect, useRef, useState } from 'react'
import { CommentForm } from './comment-form'
import { PANEL, PANEL_CLASS } from './composer'
import { useGenerate } from './use-generate'
import { placePanel } from './model'
import type { PickedElement } from './types'

/**
 * The comment box for the board in full screen Play. `size` is the shown size of the board and
 * `pick.rect` is already scaled to it, so the highlight and the box are placed from it inside the
 * board's wrapper.
 */
export function FrameComposer({
  size,
  pick,
  page,
  canVary = true,
  onSave,
  onSent,
  onCancel,
}: {
  size: { width: number; height: number }
  pick: PickedElement
  page: string
  /** False for a board that is itself a variant: the Variants toggle is not offered. */
  canVary?: boolean
  onSave: (body: string, images: string[], sendTo: string | null) => Promise<void>
  onSent: (count: number) => void
  onCancel: () => void
}) {
  const variants = useGenerate({ page, pick, onSent })
  const dialog = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(PANEL.height)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight || PANEL.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const at = placePanel(pick.rect, size, { width: PANEL.width, height })
  return (
    <>
      <div
        aria-hidden="true"
        className="outline-pick pointer-events-none absolute start-0 top-0 outline-2"
        style={{
          width: pick.rect.width,
          height: pick.rect.height,
          transform: `translate(${pick.rect.x}px, ${pick.rect.y}px)`,
        }}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-label="New comment"
        className={PANEL_CLASS}
        style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
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
