'use client'

import { useRef, useState } from 'react'
import { type Notice, noticeOf, type VersionInfo } from '../lib/version-info'
import { useMountEffect } from './use-mount-effect'

export type UpdatePhase = 'idle' | 'updating' | 'restarting' | 'failed'

export const DISMISSED_KEY = 'irsim.update.dismissed'
const CHECK_EVERY_MS = 60 * 60 * 1000
const POLL_EVERY_MS = 1000
const GIVE_UP_AFTER_MS = 60 * 1000
const NOT_BACK = 'The canvas did not come back. Run irsim serve in the project.'

/** The notice, unless the user dismissed exactly this version. */
export const unlessDismissed = (notice: Notice | null, dismissed: string | null): Notice | null =>
  notice !== null && notice.version === dismissed ? null : notice

const readDismissed = (): string | null => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

const writeDismissed = (version: string) => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, version)
  } catch {}
}

const readInfo = async (): Promise<VersionInfo | null> => {
  const response = await fetch('/api/version', {
    cache: 'no-store',
    signal: AbortSignal.timeout(2000),
  })
  return response.ok ? ((await response.json()) as VersionInfo) : null
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Checks `/api/version` on mount and hourly, and runs the update from the canvas. While an update
 * runs, `notice` stays the one the user clicked, so a later check cannot change the card under them.
 */
export function useUpdate() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Notice | null>(null)
  const mounted = useRef(false)

  useMountEffect(() => {
    mounted.current = true
    setDismissed(readDismissed())
    const check = () => {
      readInfo()
        .then((next) => {
          if (mounted.current && next !== null) setInfo(next)
        })
        .catch(() => {})
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  })

  const fail = (message: string) => {
    if (!mounted.current) return
    setError(message)
    setPhase('failed')
  }

  const waitForRestart = async (version: string) => {
    const deadline = Date.now() + GIVE_UP_AFTER_MS
    while (mounted.current && Date.now() < deadline) {
      await wait(POLL_EVERY_MS)
      try {
        const next = await readInfo()
        if (next?.running === version && mounted.current) {
          window.location.reload()
          return
        }
      } catch {}
    }
    fail(NOT_BACK)
  }

  const notice = phase === 'idle' ? unlessDismissed(info && noticeOf(info), dismissed) : active

  const start = async () => {
    if (notice === null || phase === 'updating' || phase === 'restarting') return
    setActive(notice)
    setError(null)
    setPhase(notice.kind === 'available' ? 'updating' : 'restarting')
    try {
      const response = await fetch('/api/update', { method: 'POST' })
      const body = (await response.json().catch(() => ({}))) as {
        version?: string
        error?: string
      }
      if (response.status !== 202 || typeof body.version !== 'string') {
        fail(body.error ?? `The update failed (HTTP ${response.status}).`)
        return
      }
      if (mounted.current) setPhase('restarting')
      await waitForRestart(body.version)
    } catch {
      fail('The update request did not reach the canvas.')
    }
  }

  const dismiss = () => {
    if (notice !== null) {
      writeDismissed(notice.version)
      setDismissed(notice.version)
    }
    setPhase('idle')
    setError(null)
  }

  return { notice, phase, error, running: info?.running ?? null, dismiss, start }
}
