'use client'

import { useCallback, useRef, useState } from 'react'
import { useMountEffect } from '../use-mount-effect'
import { boardsToReload } from './model'

type ReadyMessage = { type?: unknown; board?: unknown; details?: { closure?: unknown } }

/**
 * Remembers each frame's import closure from its `ready` message. `reload(board)` bumps the
 * counter of every frame whose closure holds `board`; a frame uses its counter as the iframe key.
 */
export function useBoardReloads() {
  const closures = useRef(new Map<string, readonly string[]>())
  const [counters, setCounters] = useState<Record<string, number>>({})

  useMountEffect(() => {
    const onMessage = (event: MessageEvent<ReadyMessage>) => {
      if (event.origin !== window.location.origin) return
      const { type, board, details } = event.data ?? {}
      if (type !== 'ready' || typeof board !== 'string') return
      const closure = details?.closure
      if (Array.isArray(closure)) {
        closures.current.set(
          board,
          closure.filter((name): name is string => typeof name === 'string'),
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  const reload = useCallback((changed: string) => {
    const names = boardsToReload(closures.current, changed)
    if (names.length === 0) return
    setCounters((current) => {
      const next = { ...current }
      for (const name of names) next[name] = (next[name] ?? 0) + 1
      return next
    })
  }, [])

  const reloadAll = useCallback(() => {
    const names = [...closures.current.keys()]
    if (names.length === 0) return
    setCounters((current) => {
      const next = { ...current }
      for (const name of names) next[name] = (next[name] ?? 0) + 1
      return next
    })
  }, [])

  return { counters, reload, reloadAll }
}
