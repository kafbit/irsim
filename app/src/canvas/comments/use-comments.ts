'use client'

import { useCallback, useRef, useState } from 'react'
import { useMountEffect } from '../use-mount-effect'
import type { Comment, NewComment } from './types'

async function request(method: string, url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (response.ok) return response.json().catch(() => null)
  const detail = await response.json().catch(() => null)
  const message = (detail as { error?: unknown } | null)?.error
  throw new Error(typeof message === 'string' ? message : `HTTP ${response.status}`)
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly refused: boolean,
  ) {
    super(message)
  }
}

/** Sends the bytes of a pasted image and returns its id. Throws an `UploadError`, `refused` for a type or size refusal. */
export async function uploadImage(file: Blob): Promise<string> {
  const response = await fetch('/api/comments/images', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const detail = (await response.json().catch(() => null)) as {
    id?: unknown
    error?: unknown
  } | null
  if (response.ok && typeof detail?.id === 'string') return detail.id
  const message = typeof detail?.error === 'string' ? detail.error : `HTTP ${response.status}`
  throw new UploadError(message, response.status === 413 || response.status === 415)
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
    async (method: string, url: string, body?: unknown, onResult?: (result: unknown) => void) => {
      setError(null)
      try {
        onResult?.(await request(method, url, body))
      } catch (failure) {
        setError(String((failure as Error)?.message ?? failure))
        throw failure
      } finally {
        await refetch()
      }
    },
    [refetch],
  )

  const sendOne = (id: string, sessionId: string) =>
    write('POST', '/api/comments/send', { sessionId, page: pageId, ids: [id] })

  const actions = {
    create: async (input: NewComment, sendTo: string | null = null): Promise<string | null> => {
      let id: unknown
      await write('POST', '/api/comments', input, (created) => {
        id = (created as { id?: unknown } | null)?.id
      })
      if (!sendTo || typeof id !== 'string') return null
      return sendOne(id, sendTo).then(
        () => null,
        (failure: unknown) => String((failure as Error)?.message ?? failure),
      )
    },
    edit: (id: string, body: string, images: string[]) =>
      write('PATCH', `/api/comments/${id}`, { body, images }),
    resolve: (id: string) => write('PATCH', `/api/comments/${id}`, { status: 'resolved' }),
    reply: (id: string, body: string, images: string[] = []) =>
      write('POST', `/api/comments/${id}/reply`, {
        author: 'user',
        body,
        ...(images.length > 0 ? { images } : {}),
      }),
    remove: (id: string) => write('DELETE', `/api/comments/${id}`),
    send: (sessionId: string) => write('POST', '/api/comments/send', { sessionId, page: pageId }),
    sendOne,
    retarget: (id: string, sessionId: string) =>
      write('PATCH', `/api/comments/${id}`, { sessionId }),
  }

  return { comments, error, refetch, uploadImage, ...actions }
}
