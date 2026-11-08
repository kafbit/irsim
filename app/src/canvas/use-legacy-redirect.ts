'use client'

import { useRouter } from 'next/navigation'
import type { PageManifest, PageSummary } from './types'
import { useMountEffect } from './use-mount-effect'

/** `/?board=X` was the old single-board view: finds the page that holds X and moves to its `alone` route. */
export function useLegacyRedirect(board: string | null) {
  const router = useRouter()
  useMountEffect(() => {
    if (!board) return
    const controller = new AbortController()
    const load = async <T>(url: string): Promise<T | null> => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      return response.ok ? ((await response.json()) as T) : null
    }
    ;(async () => {
      const pages = (await load<PageSummary[]>('/api/pages')) ?? []
      const manifests = await Promise.all(
        pages.map((page) => load<PageManifest>(`/api/pages/${encodeURIComponent(page.id)}`)),
      )
      const owner = manifests.find((page) => page?.boards.some((item) => item.name === board))
      if (owner) {
        router.replace(
          `/p/${encodeURIComponent(owner.id)}?board=${encodeURIComponent(board)}&alone=1`,
        )
      }
    })().catch(() => {})
    return () => controller.abort()
  })
}
