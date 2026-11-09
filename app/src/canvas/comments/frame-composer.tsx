'use client'

import { CommentForm } from './comment-form'
import { PANEL, PANEL_CLASS } from './composer'
import { placePanel } from './model'
import type { PickedElement } from './types'

/**
 * The comment box for one board shown alone. The board sits at scale 1, so the picked rect is
 * already in page pixels: the highlight and the box are placed from it inside the board's wrapper
 * and scroll with it.
 */
export function FrameComposer({
  size,
  pick,
  onSave,
  onCancel,
}: {
  size: { width: number; height: number }
  pick: PickedElement
  onSave: (body: string, images: string[]) => Promise<void>
  onCancel: () => void
}) {
  const at = placePanel(pick.rect, size, PANEL)
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
        role="dialog"
        aria-label="New comment"
        className={PANEL_CLASS}
        style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      >
        <CommentForm pick={pick} onSave={onSave} onCancel={onCancel} />
      </div>
    </>
  )
}
