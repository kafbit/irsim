import { memo } from 'react'
import type { PlacedBoard } from '../geometry'
import { isWholeBoard } from '../../lib/place-text'
import { placedRect } from './model'
import type { Comment } from './types'

/** Draft pins are muted, sent ones primary. A reply adds a saffron dot. */
const TONE = {
  draft: 'bg-muted-foreground',
  queued: 'bg-primary',
  delivered: 'bg-primary',
} as const

/**
 * Numbered pins at the top-end corner of each open comment's rect. They sit in the scaled world,
 * so they follow pan and zoom, and counter-scale by `--inv` to keep their screen size.
 */
export const CommentLayer = memo(function CommentLayer({
  boards,
  comments,
  numbers,
  activeId,
  onOpen,
  viewport = null,
}: {
  boards: PlacedBoard[]
  comments: Comment[]
  numbers: ReadonlyMap<string, number>
  activeId: string | null
  onOpen: (id: string) => void
  viewport?: { width: number; height: number } | null
}) {
  return (
    <div className="pointer-events-none absolute start-0 top-0">
      {comments.map((comment) => {
        const frame = boards.find((board) => board.name === comment.board)
        if (!frame || comment.status === 'resolved') return null
        const { view } = comment
        if (view && !(viewport && view.width === viewport.width && view.height === viewport.height)) {
          return null
        }
        const number = numbers.get(comment.id) ?? 0
        const whole = isWholeBoard(comment)
        const rect = placedRect(frame, comment)
        return (
          <button
            key={comment.id}
            type="button"
            data-pin=""
            aria-label={`Comment ${number}`}
            onClick={() => onOpen(comment.id)}
            className={`pointer-events-auto absolute grid size-6 cursor-pointer place-items-center rounded-full text-xs font-semibold text-primary-foreground tabular-nums in-data-blocked:pointer-events-none ${TONE[comment.status]} ${
              activeId === comment.id ? 'outline-2 outline-offset-2 outline-ring' : ''
            }`}
            style={{
              left: frame.x + rect.x + rect.width,
              top: frame.y + rect.y,
              transform: `${
                whole ? 'translate(calc(-20px * var(--inv, 1)), calc(20px * var(--inv, 1))) ' : ''
              }translate(-50%, -50%) scale(var(--inv, 1))`,
            }}
          >
            {number}
            {comment.replies.length > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-highlight"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
})
