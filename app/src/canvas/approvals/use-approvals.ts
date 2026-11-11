'use client'

import { useCallback, useRef, useState } from 'react'
import type { BoardApproval, PageApprovals } from '../../lib/comments-types'
import { useMountEffect } from '../use-mount-effect'

export type { BoardApproval }

/** `approved`: the board is as the user approved it. `changed`: it was edited after that. */
export type ApprovalState = 'approved' | 'changed'

export const approvalStateOf = (approval: BoardApproval | undefined): ApprovalState | undefined =>
  approval ? (approval.current ? 'approved' : 'changed') : undefined

export type ApproveInput = { board: string; sessionId: string; note: string }

/**
 * The page's boards' content hashes and latest approvals. `refetch` is stable and ignores a
 * response that a later request has overtaken; call it when a board or an approval changes.
 * `approve` sends the hash last read, so the server refuses a board that changed since then.
 */
export function useApprovals(pageId: string) {
  const [data, setData] = useState<{
    hashes: Record<string, string>
    approvals: Map<string, BoardApproval>
  }>(() => ({ hashes: {}, approvals: new Map() }))
  const latest = useRef(0)
  const hashes = useRef<Record<string, string>>({})

  const refetch = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const response = await fetch(`/api/approvals?page=${encodeURIComponent(pageId)}`, {
        cache: 'no-store',
      })
      if (!response.ok || ticket !== latest.current) return
      const body = (await response.json()) as PageApprovals
      if (ticket !== latest.current) return
      hashes.current = body.hashes
      setData({ hashes: body.hashes, approvals: new Map(body.approvals.map((a) => [a.board, a])) })
    } catch {
      // The badge is a convenience: on failure the last known state stays.
    }
  }, [pageId])

  useMountEffect(() => {
    void refetch()
  })

  const approve = useCallback(
    async ({ board, sessionId, note }: ApproveInput) => {
      const hash = hashes.current[board]
      if (!hash) throw new Error('The board is still loading. Try again.')
      const response = await fetch('/api/approvals', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: pageId, board, sessionId, note, hash }),
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: unknown } | null
        await refetch()
        throw new Error(typeof detail?.error === 'string' ? detail.error : `HTTP ${response.status}`)
      }
      await refetch()
    },
    [pageId, refetch],
  )

  return { approvals: data.approvals, refetch, approve }
}
