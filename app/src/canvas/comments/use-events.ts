'use client'

import { useMountEffect } from '../use-mount-effect'

type Handlers = {
  onBoard: (board: string) => void
  onComments: () => void
  onApprovals?: () => void
  onThumb?: (board: string, ok: boolean) => void
  onCanvas?: () => void
}

/**
 * The app's one `EventSource` on `/api/events`; EventSource reconnects by itself. `onComments`
 * also runs when the stream (re)opens, to catch up on writes missed while it was down. Both
 * handlers are read once, at mount, so they must be stable.
 */
export function useEvents({ onBoard, onComments, onApprovals, onThumb, onCanvas }: Handlers) {
  useMountEffect(() => {
    const source = new EventSource('/api/events')
    source.addEventListener('open', onComments)
    source.addEventListener('comments', onComments)
    if (onApprovals) {
      source.addEventListener('open', onApprovals)
      source.addEventListener('approvals', onApprovals)
    }
    source.addEventListener('board', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { board?: unknown }
        if (typeof data.board === 'string') onBoard(data.board)
      } catch {}
    })
    if (onCanvas) source.addEventListener('canvas', onCanvas)
    if (onThumb) {
      source.addEventListener('thumb', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as {
            board?: unknown
            ok?: unknown
          }
          if (typeof data.board === 'string' && typeof data.ok === 'boolean') {
            onThumb(data.board, data.ok)
          }
        } catch {}
      })
    }
    return () => source.close()
  })
}
