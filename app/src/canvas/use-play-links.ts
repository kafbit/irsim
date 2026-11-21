'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMountEffect } from './use-mount-effect'

type LinkMessage = { type?: unknown; board?: unknown; details?: { target?: unknown; href?: unknown } }

export type PlayMode = 'canvas' | 'full'

const SAFE_URL = /^(?:https?:|mailto:|tel:)/i

/** The `/p/...` address that opens `board` on `page` and plays it. */
export const playHref = (page: string, board: string, mode: PlayMode) =>
  `/p/${encodeURIComponent(page)}?board=${encodeURIComponent(board)}&play=${mode}`

/** The page that holds `board`; `null` when no page lists it. Throws when the server cannot answer. */
export async function findBoardPage(board: string): Promise<string | null> {
  const response = await fetch(`/api/boards/${encodeURIComponent(board)}`, { cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as { page?: unknown }
  return typeof body.page === 'string' ? body.page : null
}

/** The notice for a link whose board could not be opened. */
export const linkProblem = (target: string, error?: unknown) =>
  error === undefined ? `No board named ${target}.` : `Could not open ${target}: ${String(error)}`

export type PlayFlags = Map<string, { interactive: boolean; fill: boolean }>

/**
 * The `interactive` and `fill` flags of a page's boards, read again with `refresh`, so a board
 * edited while the canvas is open gains or loses its Play chip without a page reload.
 */
export function usePlayFlags(pageId: string) {
  const [flags, setFlags] = useState<PlayFlags>(() => new Map())
  const latest = useRef(0)
  const refresh = useCallback(() => {
    const call = ++latest.current
    fetch(`/api/pages/${encodeURIComponent(pageId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as {
          boards: { name: string; interactive: boolean; fill: boolean }[]
        }
        if (call !== latest.current) return
        setFlags(new Map(body.boards.map((b) => [b.name, { interactive: b.interactive, fill: b.fill }])))
      })
      // The flags are a convenience: on failure the ones from the first load stay.
      .catch(() => {})
  }, [pageId])
  return { flags, refresh }
}

/**
 * Link clicks inside a frame (see `public/runtime/links.js`). `onNavigate(from, target)` runs for
 * `<a href="Target.html">` (or the legacy `Target.dc.html`) in the board `from`. A web link opens in a new tab here, because the
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
