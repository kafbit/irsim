'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useMountEffect } from '../use-mount-effect'
import { chooseSession } from './model'
import type { Session } from './types'

const KEY = 'canvas:session'
const POLL_MS = 5000

const readStored = () => {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

const writeStored = (id: string) => {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {}
}

/**
 * The live Claude sessions, polled every 5 s, and the one a send goes to (see `chooseSession`).
 * The `?session=` id and a pick are remembered in `sessionStorage`, so they last for the tab.
 */
export function useSession() {
  const fromUrl = useSearchParams().get('session')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loaded, setLoaded] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [stored] = useState(() => {
    if (fromUrl) writeStored(fromUrl)
    return fromUrl ?? readStored()
  })

  useMountEffect(() => {
    const controller = new AbortController()
    const load = () =>
      fetch('/api/sessions', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return
          setSessions((await response.json()) as Session[])
          setLoaded(true)
        })
        .catch(() => {})
    void load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  })

  const pick = useCallback((id: string) => {
    writeStored(id)
    setPicked(id)
  }, [])

  const sessionId = chooseSession({ sessions, fromUrl, stored, picked })
  return { sessions, loaded, sessionId, pick }
}
