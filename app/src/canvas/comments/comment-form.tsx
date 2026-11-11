'use client'

import { Button, Textarea } from '../../ui'
import { useState } from 'react'
import { ImageStrip } from './image-strip'
import type { PickedElement } from './types'
import { usePastedImages } from './use-pasted-images'

const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()

/** The body of a new comment: the picked source line, the text box, Cancel and Save. Save is Ctrl/Cmd+Enter, Cancel is Esc. */
export function CommentForm({
  pick,
  onSave,
  onCancel,
}: {
  pick: PickedElement
  onSave: (body: string, images: string[]) => Promise<void>
  onCancel: () => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const pasted = usePastedImages()
  const text = body.trim()
  const ready = text !== '' && pasted.uploading === 0

  const save = async () => {
    if (!ready || pending) return
    setPending(true)
    setFailed(false)
    try {
      await onSave(text, pasted.images)
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <>
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
        onPaste={pasted.onPaste}
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
      <ImageStrip
        images={pasted.images}
        uploading={pasted.uploading}
        message={pasted.message}
        onRemove={pasted.remove}
      />
      {failed ? <p className="m-0 text-xs text-destructive">Could not save the comment.</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel (Esc)
        </Button>
        <Button size="sm" disabled={!ready} pending={pending} onClick={save}>
          Save (Ctrl+Enter)
        </Button>
      </div>
    </>
  )
}
