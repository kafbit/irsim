'use client'

import { Badge, Button, IconButton, Textarea } from '@kafbit/ui'
import { Check, DeleteIcon, EditIcon } from '@kafbit/ui/icons'
import { useState } from 'react'
import type { Comment } from './types'

const STATUS = {
  draft: 'Draft',
  queued: 'Queued',
  delivered: 'Delivered',
  resolved: 'Resolved',
} as const

const focusOnMount = (element: HTMLTextAreaElement | null) => element?.focus()

type Props = {
  comment: Comment
  number: number
  active: boolean
  onLocate: (comment: Comment) => void
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onResolve: (id: string) => Promise<void>
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
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)

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
    if (!body) return
    if (await run(() => onEdit(comment.id, body))) setEditing(false)
  }

  const { element } = comment
  return (
    <li
      id={`comment-${comment.id}`}
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
            {comment.file}:{comment.line}
          </code>
        </button>
        <Badge size="sm" tone={comment.status === 'delivered' ? 'success' : 'neutral'}>
          {STATUS[comment.status]}
        </Badge>
      </div>
      <p dir="ltr" className="m-0 truncate text-xs text-muted-foreground">
        {element.path}
        {element.text ? <span dir="auto"> "{element.text}"</span> : null}
      </p>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            ref={focusOnMount}
            aria-label="Comment"
            dir="auto"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
              else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void saveEdit()
            }}
            className="min-h-16 text-sm focus-visible:ring-0"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!draft.trim()} pending={busy} onClick={saveEdit}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p dir="auto" className="m-0 text-sm whitespace-pre-wrap">
          {comment.body}
        </p>
      )}
      {comment.replies.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 border-s-2 border-border p-0 ps-2">
          {comment.replies.map((reply) => (
            <li key={reply.at + reply.author} className="text-sm">
              <span className="font-semibold">{reply.author === 'claude' ? 'Claude' : 'You'}</span>{' '}
              <span dir="auto" className="whitespace-pre-wrap">
                {reply.body}
              </span>
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
