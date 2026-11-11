'use client'

import { useCallback, useRef, useState } from 'react'
import { useMountEffect } from '../use-mount-effect'

export type BoardApproval = { board: string; at: string; current: boolean }

/** `approved`: the board is as the user approved it. `changed`: it was edited after that. */
export type ApprovalState = 'approved' | 'changed'

export const approvalStateOf = (approval: BoardApproval | undefined): ApprovalState | undefined =>
  approval ? (approval.current ? 'approved' : 'changed') : undefined

/**
 * The latest approval of each board of a page. `refetch` is stable and ignores a response that a
 * later request has overtaken; call it when a board or the comments change.
 */
export function useApprovals(pageId: string) {
  const [approvals, setApprovals] = useState<Map<string, BoardApproval>>(() => new Map())
  const latest = useRef(0)

  const refetch = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const response = await fetch(`/api/approvals?page=${encodeURIComponent(pageId)}`, {
        cache: 'no-store',
      })
      if (!response.ok || ticket !== latest.current) return
      const list = (await response.json()) as BoardApproval[]
      if (ticket === latest.current) setApprovals(new Map(list.map((a) => [a.board, a])))
    } catch {
      // The badge is a convenience: on failure the last known state stays.
    }
  }, [pageId])

  useMountEffect(() => {
    void refetch()
  })

  const approve = useCallback(
    async (input: { board: string; sessionId: string; note: string }) => {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, page: pageId }),
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: unknown } | null
        throw new Error(typeof detail?.error === 'string' ? detail.error : `HTTP ${response.status}`)
      }
      await refetch()
    },
    [pageId, refetch],
  )

  return { approvals, refetch, approve }
}
