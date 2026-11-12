'use client'

import { useRef, useState } from 'react'
import { type Notice, noticeOf, type VersionInfo } from '../lib/version-info'
import { useMountEffect } from './use-mount-effect'

export type UpdatePhase = 'idle' | 'updating' | 'restarting' | 'failed'

export const DISMISSED_KEY = 'irsim.update.dismissed'
const CHECK_EVERY_MS = 60 * 60 * 1000
const POLL_EVERY_MS = 1000
const WATCH_EVERY_MS = 5000
const GIVE_UP_AFTER_MS = 60 * 1000
const NOT_BACK = 'The canvas did not come back. Run irsim serve in the project.'

export const dismissalKey = (notice: Notice): string => `${notice.kind}:${notice.version}`

export const unlessDismissed = (notice: Notice | null, dismissed: string | null): Notice | null =>
  notice !== null && dismissalKey(notice) === dismissed ? null : notice

export const shouldReload = (baseline: string | null, next: VersionInfo | null): boolean =>
  baseline !== null && next !== null && next.running !== baseline

const readDismissed = (): string | null => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

const writeDismissed = (key: string) => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, key)
  } catch {}
}

const readInfo = async ({ probe }: { probe: boolean }): Promise<VersionInfo | null> => {
  const response = await fetch(probe ? '/api/version?latest=0' : '/api/version', {
    cache: 'no-store',
    signal: AbortSignal.timeout(probe ? 2000 : 15000),
  })
  return response.ok ? ((await response.json()) as VersionInfo) : null
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function useUpdate() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Notice | null>(null)
  const [restartFailed, setRestartFailed] = useState(false)
  const mounted = useRef(false)
  const baseline = useRef<string | null>(null)
  const phaseRef = useRef<UpdatePhase>('idle')
  phaseRef.current = phase

  useMountEffect(() => {
    mounted.current = true
    setDismissed(readDismissed())
    const check = () => {
      readInfo({ probe: false })
        .then((next) => {
          if (next !== null && baseline.current === null) baseline.current = next.running
          if (mounted.current && next !== null) setInfo(next)
        })
        .catch(() => {})
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    const watch = () => {
      if (document.visibilityState !== 'visible' || phaseRef.current !== 'idle') return
      readInfo({ probe: true })
        .then((next) => {
          if (!mounted.current || phaseRef.current !== 'idle') return
          if (baseline.current === null && next !== null) baseline.current = next.running
          else if (shouldReload(baseline.current, next)) window.location.reload()
        })
        .catch(() => {})
    }
    const watcher = setInterval(watch, WATCH_EVERY_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
      clearInterval(watcher)
    }
  })

  const fail = (message: string, didNotComeBack = false) => {
    if (!mounted.current) return
    setError(message)
    setRestartFailed(didNotComeBack)
    setPhase('failed')
  }

  const waitForRestart = async (version: string) => {
    const deadline = Date.now() + GIVE_UP_AFTER_MS
    while (mounted.current && Date.now() < deadline) {
      await wait(POLL_EVERY_MS)
      try {
        const next = await readInfo({ probe: true })
        if (next?.running === version && mounted.current) {
          window.location.reload()
          return
        }
      } catch {}
    }
    fail(NOT_BACK, true)
  }

  const notice = phase === 'idle' ? unlessDismissed(info && noticeOf(info), dismissed) : active

  const start = async () => {
    if (notice === null || phase === 'updating' || phase === 'restarting') return
    setActive(notice)
    setError(null)
    setRestartFailed(false)
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
    if (notice !== null && phase !== 'failed') {
      const key = dismissalKey(notice)
      writeDismissed(key)
      setDismissed(key)
    }
    setPhase('idle')
    setError(null)
    setRestartFailed(false)
  }

  return { notice, phase, error, restartFailed, running: info?.running ?? null, dismiss, start }
}
