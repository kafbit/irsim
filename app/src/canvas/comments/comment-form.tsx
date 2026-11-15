'use client'

import { placeText } from '../../lib/place-text'
import { Button, Textarea } from '../../ui'
import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { ImageStrip } from './image-strip'
import type { PickedElement } from './types'
import { usePastedImages } from './use-pasted-images'

const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()

const NO_SESSION = 'No Claude session. Run /irsim in Claude Code.'

const TOGGLE_ON = 'Back to a plain comment'
const TOGGLE_OFF = 'Generate variants from this note'

const COUNTS = [2, 3] as const

/**
 * The body of a new comment: the picked source line, the text box, Cancel and Save. Save is Ctrl/Cmd+Enter, Cancel is Esc.
 * The Variants toggle swaps Save for Generate, which sends the note and the pasted images to `onGenerate` with a count of 2 or 3.
 */
export function CommentForm({
  pick,
  onSave,
  onGenerate,
  canGenerate = true,
  onCancel,
}: {
  pick: PickedElement
  onSave: (body: string, images: string[]) => Promise<void>
  onGenerate?: ((note: string, count: number, images: string[]) => Promise<void>) | undefined
  canGenerate?: boolean
  onCancel: () => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variants, setVariants] = useState(false)
  const [count, setCount] = useState<number>(3)
  const pasted = usePastedImages()
  const text = body.trim()
  const generating = variants && onGenerate !== undefined
  const ready = text !== '' && pasted.uploading === 0 && (!generating || canGenerate)

  const save = async () => {
    if (!ready || pending) return
    setPending(true)
    setError(null)
    try {
      if (generating) await onGenerate(text, count, pasted.images)
      else await onSave(text, pasted.images)
    } catch (failure) {
      setError(
        generating
          ? failure instanceof Error
            ? failure.message
            : String(failure)
          : 'Could not save the comment.',
      )
      setPending(false)
    }
  }

  return (
    <>
      <code dir="ltr" className="truncate text-xs text-muted-foreground">
        {placeText(pick)}
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
      {generating ? (
        <section
          aria-label="Variants"
          className="flex flex-col gap-2 rounded-[10px] bg-secondary p-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
              <LayoutGrid size={14} aria-hidden="true" />
              Generate variants
            </span>
            <div
              role="radiogroup"
              aria-label="How many variants"
              className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5"
            >
              {COUNTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={count === option}
                  disabled={pending}
                  onClick={() => setCount(option)}
                  className={`grid h-6 w-8 place-items-center rounded-md border-0 p-0 text-xs font-medium ${
                    count === option
                      ? 'bg-card text-foreground'
                      : 'bg-transparent text-muted-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <p className="m-0 text-xs leading-4 text-muted-foreground">
            {canGenerate
              ? `Claude makes ${count} different takes on your note as copies next to the board. Compare them and keep one. Ctrl+Enter generates.`
              : NO_SESSION}
          </p>
        </section>
      ) : null}
      {error ? <p className="m-0 text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        {onGenerate ? (
          <button
            type="button"
            aria-pressed={variants}
            aria-label={variants ? TOGGLE_ON : TOGGLE_OFF}
            title={variants ? TOGGLE_ON : TOGGLE_OFF}
            disabled={pending}
            onClick={() => setVariants(!variants)}
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border p-0 ${
              variants
                ? 'border-foreground bg-accent text-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid size={14} aria-hidden="true" />
          </button>
        ) : null}
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel (Esc)
        </Button>
        <Button size="sm" disabled={!ready} pending={pending} onClick={save}>
          {generating ? `Generate ${count}` : 'Save (Ctrl+Enter)'}
        </Button>
      </div>
    </>
  )
}
