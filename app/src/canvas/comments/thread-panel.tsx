'use client'

import { IconButton } from '@kafbit/ui'
import { X } from '@kafbit/ui/icons'
import { useEffect } from 'react'
import { CommentCard } from './comment-card'
import { groupComments } from './model'
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
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onResolve: (id: string) => Promise<void>
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
    ['Resolved', groups.resolved],
  ] as const

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
                {list.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    number={numbers.get(comment.id) ?? 0}
                    active={activeId === comment.id}
                    onLocate={onLocate}
                    onEdit={actions.onEdit}
                    onDelete={actions.onDelete}
                    onResolve={actions.onResolve}
                  />
                ))}
              </ul>
            </section>
          ),
        )}
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
