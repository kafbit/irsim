'use client'

import { IconButton } from '../../ui'
import { ChevronDown, X } from '../../ui/icons'
import { useEffect, useState } from 'react'
import { CommentCard } from './comment-card'
import { groupComments, resolvedHeading } from './model'
import { SendFooter } from './send-footer'
import type { Comment } from './types'
import { useSession } from './use-session'

type Props = {
  comments: Comment[]
  numbers: ReadonlyMap<string, number>
  activeId: string | null
  error: string | null
  onClose: () => void
  onLocate: (comment: Comment) => void
  onEdit: (id: string, body: string, images: string[]) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onResolve: (id: string) => Promise<void>
  onReply: (id: string, body: string) => Promise<void>
  onSend: (sessionId: string) => Promise<void>
}

/** The end-side panel: the page's comments as Draft, Sent and Resolved, and the footer that sends the drafts. */
export function ThreadPanel({
  comments,
  numbers,
  activeId,
  error,
  onClose,
  onLocate,
  ...actions
}: Props) {
  const groups = groupComments(comments)
  const session = useSession()
  const sections = [
    ['Draft', groups.draft],
    ['Sent', groups.sent],
  ] as const
  const resolvedTitle = resolvedHeading(groups.resolved.length)
  const [resolvedOpen, setResolvedOpen] = useState(false)
  const [lastActive, setLastActive] = useState<string | null>(null)
  if (activeId !== lastActive) {
    setLastActive(activeId)
    if (groups.resolved.some((comment) => comment.id === activeId)) setResolvedOpen(true)
  }
  const card = (comment: Comment) => (
    <CommentCard
      key={comment.id}
      comment={comment}
      number={numbers.get(comment.id) ?? 0}
      active={activeId === comment.id}
      onLocate={onLocate}
      onEdit={actions.onEdit}
      onDelete={actions.onDelete}
      onResolve={actions.onResolve}
      onReply={actions.onReply}
      sessionEnded={
        session.loaded &&
        comment.status === 'queued' &&
        comment.sessionId !== null &&
        !session.sessions.some((live) => live.id === comment.sessionId)
      }
    />
  )

  // Scrolls the opened thread into view: the DOM scroll position is an external system.
  useEffect(() => {
    if (activeId) {
      document.getElementById(`comment-${activeId}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId])

  return (
    <aside
      aria-label="Comments"
      className="flex w-80 shrink-0 flex-col border-s border-border bg-card"
    >
      <header className="flex items-center justify-between border-b border-border p-4">
        <h2 className="m-0 text-base font-semibold">Comments ({comments.length})</h2>
        <IconButton label="Close" icon={<X className="size-4" />} onClick={onClose} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {comments.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            Press C, then click an element in a board to comment on it.
          </p>
        ) : null}
        {sections.map(([title, list]) =>
          list.length === 0 ? null : (
            <section key={title} className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-semibold text-muted-foreground">
                {title} ({list.length})
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {list.map(card)}
              </ul>
            </section>
          ),
        )}
        {resolvedTitle ? (
          <details
            open={resolvedOpen}
            onToggle={(event) => setResolvedOpen(event.currentTarget.open)}
            className="group flex flex-col gap-2"
          >
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 -rotate-90 group-open:rotate-0 rtl:rotate-90 rtl:group-open:rotate-0"
              />
              {resolvedTitle}
            </summary>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {groups.resolved.map(card)}
            </ul>
          </details>
        ) : null}
        {error ? <p className="m-0 text-xs text-destructive">{error}</p> : null}
      </div>
      <SendFooter
        sessions={session.sessions}
        loaded={session.loaded}
        sessionId={session.sessionId}
        draftCount={groups.draft.length}
        onPick={session.pick}
        onSend={actions.onSend}
      />
    </aside>
  )
}
