'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { moveRect } from './frame-edit'
import type { PlacedBoard, Rect } from './geometry'
import { useMountEffect } from './use-mount-effect'

const NUDGE_QUIET_MS = 400
const ERROR_MS = 6000

type Pending = { name: string; rect: Rect; before: Rect }

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height })

async function save(page: string, board: string, rect: Rect): Promise<void> {
  const response = await fetch('/api/canvas', {
    method: 'PATCH',
    cache: 'no-store',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page, board, ...rect }),
  })
  if (response.ok) return
  const detail = (await response.json().catch(() => null)) as { error?: unknown } | null
  throw new Error(typeof detail?.error === 'string' ? detail.error : `HTTP ${response.status}`)
}

/**
 * The page's boards with the user's moves and resizes applied: committed overrides, the rect being
 * dragged (`preview`) and the ones nudged by key. A board nobody touched keeps its object, so its
 * memoized frame does not render. `commit` is optimistic: the PATCH follows, and a failure restores
 * the previous rect and sets `error`. Nudges are saved after 400 ms without another one.
 */
export function useBoardLayout(pageId: string, base: PlacedBoard[]) {
  const [placed, setPlaced] = useState<Record<string, Rect>>({})
  const [live, setLive] = useState<{ name: string; rect: Rect } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<Pending | null>(null)
  const nudgeTimer = useRef(0)
  const errorTimer = useRef(0)

  const boards = useMemo(
    () =>
      base.map((board) => {
        const rect = live?.name === board.name ? live.rect : placed[board.name]
        return rect ? { ...board, ...rect } : board
      }),
    [base, placed, live],
  )

  const persist = useCallback(
    (name: string, rect: Rect, before: Rect) => {
      save(pageId, name, rect).catch((failure: unknown) => {
        setPlaced((current) => ({ ...current, [name]: before }))
        setError(`Could not save ${name}: ${String((failure as Error)?.message ?? failure)}`)
        window.clearTimeout(errorTimer.current)
        errorTimer.current = window.setTimeout(() => setError(null), ERROR_MS)
      })
    },
    [pageId],
  )

  const flush = useCallback(() => {
    window.clearTimeout(nudgeTimer.current)
    const waiting = pending.current
    pending.current = null
    if (waiting) persist(waiting.name, waiting.rect, waiting.before)
  }, [persist])

  const preview = useCallback(
    (name: string, rect: Rect | null) => setLive(rect ? { name, rect } : null),
    [],
  )

  const commit = useCallback(
    (name: string, rect: Rect, before: Rect) => {
      flush()
      setPlaced((current) => ({ ...current, [name]: rect }))
      setLive(null)
      persist(name, rect, before)
    },
    [flush, persist],
  )

  const nudge = useCallback(
    (board: PlacedBoard, dx: number, dy: number) => {
      if (pending.current && pending.current.name !== board.name) flush()
      const waiting = pending.current
      const rect = moveRect(waiting?.rect ?? board, dx, dy)
      pending.current = { name: board.name, rect, before: waiting?.before ?? rectOf(board) }
      setPlaced((current) => ({ ...current, [board.name]: rect }))
      window.clearTimeout(nudgeTimer.current)
      nudgeTimer.current = window.setTimeout(flush, NUDGE_QUIET_MS)
    },
    [flush],
  )

  useMountEffect(() => flush)

  return { boards, error, preview, commit, nudge }
}
