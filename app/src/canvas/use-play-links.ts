'use client'

import { useEffect, useRef } from 'react'
import { useMountEffect } from './use-mount-effect'

type LinkMessage = { type?: unknown; board?: unknown; details?: { target?: unknown; href?: unknown } }

export type PlayMode = 'canvas' | 'full'

const SAFE_URL = /^(?:https?:|mailto:|tel:)/i

/** The `/p/...` address that opens `board` on `page` and plays it. */
export const playHref = (page: string, board: string, mode: PlayMode) =>
  `/p/${encodeURIComponent(page)}?board=${encodeURIComponent(board)}&play=${mode}`

/** The page that holds `board`, or `null` when no page lists it. */
export async function findBoardPage(board: string): Promise<string | null> {
  const response = await fetch(`/api/boards/${encodeURIComponent(board)}`)
  if (!response.ok) return null
  const body = (await response.json()) as { page?: unknown }
  return typeof body.page === 'string' ? body.page : null
}

/**
 * Link clicks inside a frame (see `public/runtime/links.js`). `onNavigate(from, target)` runs for
 * `<a href="Target.dc.html">` in the board `from`. A web link opens in a new tab here, because the
 * frame sandbox has no pop-ups.
 */
export function usePlayLinks(onNavigate: (from: string, target: string) => void) {
  const latest = useRef(onNavigate)
  useEffect(() => {
    latest.current = onNavigate
  })
  // Syncs with messages from the frames, an external system.
  useMountEffect(() => {
    const onMessage = (event: MessageEvent<LinkMessage>) => {
      if (event.origin !== window.location.origin) return
      const { type, board, details } = event.data ?? {}
      if (type === 'navigate' && typeof board === 'string' && typeof details?.target === 'string') {
        latest.current(board, details.target)
      } else if (type === 'open-url' && typeof details?.href === 'string') {
        if (SAFE_URL.test(details.href)) window.open(details.href, '_blank', 'noopener,noreferrer')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })
}
