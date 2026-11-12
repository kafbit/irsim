'use client'

/* oxlint-disable next/no-img-element -- comment images come from /api/comments/images, no optimiser */

import { Badge, Button, IconButton, Textarea } from '../../ui'
import { placeText, targetName } from '../../lib/place-text'
import { viewLabel } from '../../lib/view-label'
import { Check, DeleteIcon, EditIcon, Monitor, Smartphone, Tablet } from '../../ui/icons'
import { useState } from 'react'
import { ClampedText } from './clamped-text'
import { ImageStrip, imageUrl } from './image-strip'
import type { Comment, CommentView } from './types'
import { usePastedImages } from './use-pasted-images'

const STATUS = {
  draft: 'Draft',
  queued: 'Queued',
  delivered: 'Delivered',
  resolved: 'Resolved',
} as const

const ViewIcon = ({ preset }: { preset: string }) => {
  if (preset === 'phone' || preset === 'large-phone') return <Smartphone className="size-3" />
  if (preset === 'tablet') return <Tablet className="size-3" />
  return <Monitor className="size-3" />
}

function ViewChip({ view, viewing }: { view: CommentView; viewing: boolean }) {
  return (
    <p className="m-0">
      <span
        className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap ${
          viewing ? 'bg-blue-600 text-white' : 'bg-info text-info-foreground'
        }`}
      >
        <ViewIcon preset={view.preset} />
        {viewing ? `Viewing at ${viewLabel(view)}` : viewLabel(view)}
      </span>
    </p>
  )
}

const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()

type Props = {
  comment: Comment
  number: number
  active: boolean
  onLocate: (comment: Comment) => void
  onEdit: (id: string, body: string, images: string[]) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onResolve: (id: string) => Promise<void>
  onReply: (id: string, body: string) => Promise<void>
  sessionEnded?: boolean
  viewing?: boolean
}

/** One comment: where it points, what was said, the replies, and the actions its status allows. */
export function CommentCard({
  comment,
  number,
  active,
  onLocate,
  onEdit,
  onDelete,
  onResolve,
  onReply,
  sessionEnded = false,
  viewing = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const pasted = usePastedImages(comment.images)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    const body = draft.trim()
    if (!body || pasted.uploading > 0) return
    if (await run(() => onEdit(comment.id, body, pasted.images))) setEditing(false)
  }

  const sendReply = async () => {
    const body = replyDraft.trim()
    if (!body) return
    if (await run(() => onReply(comment.id, body))) setReplyDraft('')
  }

  const cancelEdit = () => {
    pasted.reset(comment.images)
    setEditing(false)
  }

  return (
    <li
      id={`comment-${comment.id}`}
      onClick={(event) => {
        if (window.getSelection()?.toString()) return
        if (!(event.target as Element).closest('button, a, input, textarea, select, [data-reply]')) {
          onLocate(comment)
        }
      }}
      className={`flex flex-col gap-2 rounded-lg border bg-card p-3 ${
        active ? 'border-ring' : 'border-border'
      } ${comment.status === 'resolved' ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onLocate(comment)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-start focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">
            {number}
          </span>
          <code dir="ltr" className="truncate text-xs text-muted-foreground">
            {placeText(comment)}
          </code>
        </button>
        <Badge size="sm" tone={comment.status === 'delivered' ? 'success' : 'neutral'}>
          {STATUS[comment.status]}
        </Badge>
      </div>
      <p dir="ltr" className="m-0 truncate text-xs text-muted-foreground">
        {targetName(comment)}
        {comment.element.text ? <span dir="auto"> "{comment.element.text}"</span> : null}
      </p>
      {comment.view ? <ViewChip view={comment.view} viewing={viewing} /> : null}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            ref={focusOnMount}
            aria-label="Comment"
            dir="auto"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={pasted.onPaste}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancelEdit()
              else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void saveEdit()
            }}
            className="min-h-16 text-sm focus-visible:ring-0"
          />
          <ImageStrip
            images={pasted.images}
            uploading={pasted.uploading}
            message={pasted.message}
            onRemove={pasted.remove}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim() || pasted.uploading > 0}
              pending={busy}
              onClick={saveEdit}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <ClampedText text={comment.body} className="text-sm" />
      )}
      {!editing && comment.images.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {comment.images.slice(0, 4).map((id, index) => (
            <li key={id}>
              <a href={imageUrl(id)} target="_blank" rel="noreferrer">
                <img
                  src={imageUrl(id)}
                  alt={`Attachment ${index + 1}`}
                  className="size-16 rounded-md border border-border object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {comment.replies.length > 0 ? (
        <ul data-reply className="m-0 flex list-none flex-col gap-1.5 border-s-2 border-border p-0 ps-2">
          {comment.replies.map((reply) => (
            <li key={reply.at + reply.author} className="flex flex-col gap-0.5 text-sm">
              <span>
                <span className="font-semibold">
                  {reply.author === 'claude' ? 'Claude' : 'You'}
                </span>
                {reply.author === 'user' && !reply.seen ? (
                  <>
                    {' '}
                    <Badge size="sm" tone="neutral">
                      Waiting
                    </Badge>
                  </>
                ) : null}
              </span>
              <ClampedText text={reply.body} />
            </li>
          ))}
        </ul>
      ) : null}
      {comment.status === 'draft' && !editing ? (
        <div className="flex justify-end gap-1">
          <IconButton
            label="Edit"
            icon={<EditIcon className="size-4" />}
            disabled={busy}
            onClick={() => {
              setDraft(comment.body)
              pasted.reset(comment.images)
              setEditing(true)
            }}
          />
          <IconButton
            label="Delete"
            icon={<DeleteIcon className="size-4" />}
            disabled={busy}
            onClick={() => void run(() => onDelete(comment.id))}
          />
        </div>
      ) : null}
      {comment.status !== 'draft' ? (
        <div className="flex flex-col gap-2">
          {sessionEnded ? (
            <p className="m-0 text-xs text-muted-foreground">
              The session has ended. A reply waits until it returns.
            </p>
          ) : null}
          {comment.status === 'resolved' ? (
            <p className="m-0 text-xs text-muted-foreground">Replying reopens this comment.</p>
          ) : null}
          <Textarea
            aria-label="Reply"
            dir="auto"
            placeholder="Reply to Claude"
            value={replyDraft}
            disabled={busy}
            onChange={(event) => setReplyDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setReplyDraft('')
              else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendReply()
            }}
            className="min-h-12 text-sm focus-visible:ring-0"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!replyDraft.trim()} pending={busy} onClick={sendReply}>
              Reply
            </Button>
          </div>
        </div>
      ) : null}
      {comment.status === 'queued' || comment.status === 'delivered' ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<Check className="size-4" />}
          pending={busy}
          onClick={() => void run(() => onResolve(comment.id))}
        >
          Resolve
        </Button>
      ) : null}
    </li>
  )
}
