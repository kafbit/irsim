'use client'

import { Button, Textarea } from '@kafbit/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Camera } from '../camera'
import type { PlacedBoard } from '../geometry'
import { placePanel, toScreen } from './model'
import type { PickedElement } from './types'

const PANEL = { width: 320, height: 200 }
const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()
const FLOATING = 'shadow-[0_14px_36px_rgba(20,22,26,0.14)]'

/**
 * Highlights the picked rect and opens a comment box below it (above when there is no room). Both
 * follow the camera through `subscribe`, not through React. Save is Ctrl/Cmd+Enter, Cancel is Esc.
 */
export function Composer({
  camera,
  boards,
  pick,
  onSave,
  onCancel,
}: {
  camera: Camera
  boards: PlacedBoard[]
  pick: PickedElement
  onSave: (body: string) => Promise<void>
  onCancel: () => void
}) {
  const frame = useMemo(() => boards.find((board) => board.name === pick.board), [boards, pick])
  const box = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const text = body.trim()

  // Syncs the two elements with the camera, an imperative external system; React never writes their geometry.
  useEffect(
    () =>
      camera.subscribe((view, size) => {
        if (!frame || !box.current || !panel.current) return
        const rect = toScreen(frame, pick.rect, view)
        box.current.style.width = `${rect.width}px`
        box.current.style.height = `${rect.height}px`
        box.current.style.transform = `translate(${rect.x}px, ${rect.y}px)`
        const at = placePanel(rect, size, PANEL)
        panel.current.style.transform = `translate(${at.x}px, ${at.y}px)`
      }),
    [camera, frame, pick],
  )

  const save = async () => {
    if (!text || pending) return
    setPending(true)
    setFailed(false)
    try {
      await onSave(text)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <>
      <div
        ref={box}
        aria-hidden="true"
        className="outline-pick pointer-events-none absolute start-0 top-0 outline-2"
      />
      <div
        ref={panel}
        role="dialog"
        aria-label="New comment"
        className={`absolute start-0 top-0 flex w-80 flex-col gap-2 rounded-xl border border-border bg-card p-3 ${FLOATING}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <code dir="ltr" className="truncate text-xs text-muted-foreground">
          {pick.file}:{pick.line}
        </code>
        <Textarea
          ref={focusOnMount}
          aria-label="Comment"
          placeholder="What should change here?"
          dir="auto"
          value={body}
          disabled={pending}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              onCancel()
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void save()
            }
          }}
          className="min-h-20 text-sm focus-visible:ring-0"
        />
        {failed ? (
          <p className="m-0 text-xs text-destructive">Could not save the comment.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel (Esc)
          </Button>
          <Button size="sm" disabled={!text} pending={pending} onClick={save}>
            Save (Ctrl+Enter)
          </Button>
        </div>
      </div>
    </>
  )
}
