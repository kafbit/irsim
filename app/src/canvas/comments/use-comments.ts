'use client'

import { useCallback, useRef, useState } from 'react'
import { useMountEffect } from '../use-mount-effect'
import type { Comment, NewComment } from './types'

async function request(method: string, url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (response.ok) return
  const detail = await response.json().catch(() => null)
  const message = (detail as { error?: unknown } | null)?.error
  throw new Error(typeof message === 'string' ? message : `HTTP ${response.status}`)
}

/**
 * The comments of one page, newest first. `refetch` is stable and ignores a response that a later
 * request has overtaken. Every write refetches; a failed write sets `error` and rethrows.
 */
export function useComments(pageId: string) {
  const [comments, setComments] = useState<Comment[]>([])
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const refetch = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const response = await fetch(`/api/comments?page=${encodeURIComponent(pageId)}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as Comment[]
      if (ticket === latest.current) setComments(Array.isArray(data) ? data : [])
    } catch (failure) {
      if (ticket === latest.current) setError(String((failure as Error)?.message ?? failure))
    }
  }, [pageId])

  useMountEffect(() => {
    void refetch()
  })

  const write = useCallback(
    async (method: string, url: string, body?: unknown) => {
      setError(null)
      try {
        await request(method, url, body)
      } catch (failure) {
        setError(String((failure as Error)?.message ?? failure))
        throw failure
      } finally {
        await refetch()
      }
    },
    [refetch],
  )

  const actions = {
    create: (input: NewComment) => write('POST', '/api/comments', input),
    edit: (id: string, body: string) => write('PATCH', `/api/comments/${id}`, { body }),
    resolve: (id: string) => write('PATCH', `/api/comments/${id}`, { status: 'resolved' }),
    remove: (id: string) => write('DELETE', `/api/comments/${id}`),
    send: (sessionId: string) => write('POST', '/api/comments/send', { sessionId, page: pageId }),
  }

  return { comments, error, refetch, ...actions }
}
