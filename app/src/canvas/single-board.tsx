'use client'

import { Button, IconButton } from '../ui'
import { Check, MessageSquare } from '../ui/icons'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { ApproveBox } from './approvals/approve-box'
import { approvalStateOf, useApprovals } from './approvals/use-approvals'
import { CommentLayer } from './comments/comment-layer'
import { FrameComposer } from './comments/frame-composer'
import { numberComments } from './comments/model'
import { ThreadPanel } from './comments/thread-panel'
import type { Comment, PickedElement } from './comments/types'
import { useBoardReloads } from './comments/use-board-reloads'
import { useCommentMode } from './comments/use-comment-mode'
import { useComments } from './comments/use-comments'
import { useEvents } from './comments/use-events'
import type { ManifestBoard } from './types'
import { useFrameEscape } from './use-frame-escape'
import { Toast, useNotice } from './toast'
import { useMountEffect } from './use-mount-effect'
import { findBoardPage, linkProblem, usePlayLinks } from './use-play-links'

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/**
 * One board at scale 1, with the page's live behaviour: the frame reloads when its board or an
 * imported board changes, and `C` (or the button) turns on comment mode, whose picks, pins and
 * thread panel are those of the page, narrowed to this board. The board has no camera here, so
 * the composer and the pins are placed in the board's own pixels inside a wrapper that scrolls.
 */
export function SingleBoard({
  name,
  pageId,
  board,
}: {
  name: string
  pageId: string
  board: ManifestBoard | undefined
}) {
  const comments = useComments(pageId)
  const reloads = useBoardReloads()
  const [commenting, setCommenting] = useState(false)
  const [pick, setPick] = useState<PickedElement | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const numbers = useMemo(() => numberComments(comments.comments), [comments.comments])
  const own = useMemo(
    () => comments.comments.filter((comment) => comment.board === name),
    [comments.comments, name],
  )
  const placed = useMemo(() => (board ? [{ ...board, x: 0, y: 0 }] : []), [board])

  const router = useRouter()
  const [notice, setNotice] = useNotice()
  const approvals = useApprovals(pageId)
  // The board it is open for: a link to another board keeps this view, and the popover closes.
  const [approvingBoard, setApprovingBoard] = useState<string | null>(null)
  const approving = approvingBoard === name
  const { reload } = reloads
  const { refetch: refetchApprovals } = approvals
  const onBoardChange = useCallback(
    (changed: string) => {
      reload(changed)
      void refetchApprovals()
    },
    [reload, refetchApprovals],
  )
  useEvents({
    onBoard: onBoardChange,
    onComments: comments.refetch,
    onApprovals: refetchApprovals,
  })
  const approval = approvalStateOf(approvals.approvals.get(name))
  // The board is live here, so a link to another board opens that board alone.
  usePlayLinks((from, target) => {
    if (from !== name) return
    findBoardPage(target)
      .then((page) => {
        if (!page) return setNotice(linkProblem(target))
        router.push(`/p/${encodeURIComponent(page)}?board=${encodeURIComponent(target)}&alone=1`)
      })
      .catch((error: unknown) => setNotice(linkProblem(target, error)))
  })
  useCommentMode(commenting && Boolean(board), null, setPick)

  const toggle = useCallback((on?: boolean) => {
    setCommenting((current) => on ?? !current)
    setPick(null)
    setPanelOpen(true)
  }, [])
  const leave = useCallback(() => {
    setCommenting(false)
    setPick(null)
  }, [])
  useFrameEscape(leave)
  // Syncs with the window's keyboard, an external system: C toggles comment mode, Esc leaves it.
  useMountEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.target as Element | null)?.closest?.(EDITABLE)) return
      if (event.key === 'c' || event.key === 'C') toggle()
      else if (event.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openThread = useCallback((id: string) => {
    setActiveComment(id)
    setPanelOpen(true)
  }, [])
  const locate = (comment: Comment) => {
    setActiveComment(comment.id)
    document
      .querySelector(`[data-pin][aria-label="Comment ${numbers.get(comment.id) ?? 0}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }

  return (
    <div className="flex h-screen bg-surface">
      <div className="relative min-w-0 flex-1">
        <div className="absolute start-3 top-3 z-10 flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/p/${encodeURIComponent(pageId)}?board=${encodeURIComponent(name)}`}>
              Back
            </Link>
          </Button>
          <IconButton
            label="Comment (C)"
            icon={<MessageSquare className="size-4" />}
            aria-pressed={commenting}
            disabled={!board}
            className={commenting ? 'bg-secondary text-foreground' : 'bg-card'}
            onClick={() => toggle()}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Check className="size-4" />}
            aria-expanded={approving}
            disabled={!board}
            onClick={() => setApprovingBoard(approving ? null : name)}
          >
            {approval === 'approved'
              ? 'Approved'
              : approval === 'changed'
                ? 'Changed since approval'
                : 'Approve'}
          </Button>
        </div>
        {approving && board ? (
          <div className="absolute start-3 top-14 z-10 w-72 rounded-xl border border-border bg-card p-4 shadow-lg">
            <ApproveBox
              key={name}
              board={name}
              approval={approvals.approvals.get(name)}
              onApprove={approvals.approve}
            />
          </div>
        ) : null}
        <div className="flex size-full overflow-auto">
          <div
            data-board={name}
            className={`relative m-auto shrink-0 ${board ? '' : 'h-screen w-full'}`}
            style={board ? { width: board.width, height: board.height } : undefined}
          >
            <iframe
              key={reloads.counters[name] ?? 0}
              src={`/b/${encodeURIComponent(name)}`}
              title={name}
              sandbox="allow-scripts allow-same-origin"
              className="block size-full border-0 bg-white"
            />
            {board ? (
              <CommentLayer
                boards={placed}
                comments={own}
                numbers={numbers}
                activeId={activeComment}
                onOpen={openThread}
              />
            ) : null}
            {board && commenting && pick ? (
              <FrameComposer
                key={`${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
                size={board}
                pick={pick}
                onSave={async (body, images) => {
                  await comments.create({ ...pick, page: pageId, body, images })
                  setPick(null)
                }}
                onCancel={() => setPick(null)}
              />
            ) : null}
          </div>
        </div>
        <Toast message={notice} />
      </div>
      {panelOpen ? (
        <ThreadPanel
          comments={own}
          numbers={numbers}
          activeId={activeComment}
          error={comments.error}
          onClose={() => setPanelOpen(false)}
          onLocate={locate}
          onEdit={comments.edit}
          onDelete={comments.remove}
          onResolve={comments.resolve}
          onReply={comments.reply}
          onSend={comments.send}
        />
      ) : null}
    </div>
  )
}
