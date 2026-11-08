'use client'

import { useState } from 'react'
import { useMountEffect } from './use-mount-effect'

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; data: T }

/** Fetches `url` once on mount. A 404 is reported as `missing`; remount with a `key` to fetch another URL. */
export function useApi<T>(url: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' })

  useMountEffect(() => {
    const controller = new AbortController()
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return setState({ status: 'missing' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        setState({ status: 'ready', data: (await response.json()) as T })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'failed', message: String((error as Error)?.message ?? error) })
      })
    return () => controller.abort()
  })

  return state
}
