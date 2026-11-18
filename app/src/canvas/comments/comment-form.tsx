'use client'

import { placeText } from '../../lib/place-text'
import { Button, Textarea } from '../../ui'
import { Check, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { ImageStrip } from './image-strip'
import { SessionRow } from './session-row'
import type { PickedElement, Session } from './types'
import { useAutoSend } from './auto-send'
import { usePastedImages } from './use-pasted-images'

const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()


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
  session,
  onCancel,
}: {
  pick: PickedElement
  onSave: (body: string, images: string[], sendTo: string | null) => Promise<void>
  onGenerate?: ((note: string, count: number, images: string[]) => Promise<void>) | undefined
  canGenerate?: boolean
  /** The agent sessions the variants go to. Generate waits until one is picked. */
  session?:
    | {
        sessions: Session[]
        loaded: boolean
        sessionId: string | null
        onPick: (id: string) => void
      }
    | undefined
  onCancel: () => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variants, setVariants] = useState(false)
  const [count, setCount] = useState<number>(3)
  const pasted = usePastedImages()
  const [autoSend, setAutoSend] = useAutoSend()
  const sessionId = session?.sessionId ?? null
  const sending = autoSend && sessionId !== null
  const text = body.trim()
  const generating = variants && onGenerate !== undefined
  const ready = text !== '' && pasted.uploading === 0 && (!generating || canGenerate)

  const save = async () => {
    if (!ready || pending) return
    setPending(true)
    setError(null)
    try {
      if (generating) await onGenerate(text, count, pasted.images)
      else await onSave(text, pasted.images, sending ? sessionId : null)
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
            The agent makes {count} different takes on your note as copies next to the board. Compare
            them and keep one. Ctrl+Enter generates.
          </p>
          {session ? (
            <SessionRow
              compact={session.sessions.length > 0}
              sessions={session.sessions}
              loaded={session.loaded}
              sessionId={session.sessionId}
              onPick={session.onPick}
            />
          ) : null}
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
          {generating ? `Generate ${count}` : sending ? 'Send (Ctrl+Enter)' : 'Save (Ctrl+Enter)'}
        </Button>
      </div>
      {variants ? null : (
        <label
          className={`flex items-start gap-2 border-t border-border pt-2 ${
            sessionId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          }`}
        >
          <span className="relative mt-0.5 inline-grid size-4 shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={sending}
              disabled={!sessionId || pending}
              onChange={(event) => setAutoSend(event.target.checked)}
              className="peer absolute inset-0 m-0 size-4 appearance-none rounded border border-input bg-transparent checked:border-primary checked:bg-primary"
            />
            <Check
              size={12}
              strokeWidth={3}
              aria-hidden="true"
              className="pointer-events-none relative hidden text-primary-foreground peer-checked:block"
            />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] leading-5 text-foreground">Send to the active agent</span>
            <span className="text-xs leading-4 text-muted-foreground">
              {!sessionId
                ? 'No agent session listening. Run /irsim in your coding agent.'
                : sending
                  ? 'Your next comments are sent too. Turn it off to keep them as drafts.'
                  : 'Saved comments stay drafts until you send them.'}
            </span>
          </span>
        </label>
      )}
    </>
  )
}
