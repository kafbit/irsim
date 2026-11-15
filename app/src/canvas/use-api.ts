'use client'

import { useCallback, useRef, useState } from 'react'
import { useMountEffect } from './use-mount-effect'

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; data: T }

/**
 * Fetches `url` on mount. A 404 is reported as `missing`; remount with a `key` to fetch another URL.
 * `refetch` is stable and fetches again: the `ready` data stays until the new data arrives, a later
 * request overtakes an earlier one, and a failed refetch keeps the data it has.
 */
export function useApi<T>(url: string): ApiState<T> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' })
  const controller = useRef<AbortController | null>(null)
  const loaded = useRef<string | null>(null)

  const refetch = useCallback(() => {
    controller.current?.abort()
    const own = new AbortController()
    controller.current = own
    fetch(url, { cache: 'no-store', signal: own.signal })
      .then(async (response) => {
        if (response.status === 404) {
          loaded.current = null
          return setState({ status: 'missing' })
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        if (own.signal.aborted) return
        if (text === loaded.current) return
        loaded.current = text
        setState({ status: 'ready', data: JSON.parse(text) as T })
      })
      .catch((error: unknown) => {
        if (own.signal.aborted) return
        const message = String((error as Error)?.message ?? error)
        setState((current) => (current.status === 'ready' ? current : { status: 'failed', message }))
      })
  }, [url])

  useMountEffect(() => {
    refetch()
    return () => controller.current?.abort()
  })

  return { ...state, refetch }
}
