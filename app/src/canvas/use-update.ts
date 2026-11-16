'use client'

import { useEffect, useRef, useState } from 'react'
import type { UpdateProgress } from '../lib/update-progress'
import { type Notice, noticeOf, type VersionInfo } from '../lib/version-info'
import { useMountEffect } from './use-mount-effect'

export type UpdatePhase = 'idle' | 'updating' | 'restarting' | 'failed'

export const DISMISSED_KEY = 'irsim.update.dismissed'
const CHECK_EVERY_MS = 15 * 60 * 1000
const PROGRESS_EVERY_MS = 500
const POLL_EVERY_MS = 1000
const WATCH_EVERY_MS = 5000
const GIVE_UP_AFTER_MS = 60 * 1000
const NOT_BACK = 'The canvas did not come back. Run irsim serve in the project.'

export const dismissalKey = (notice: Notice): string => `${notice.kind}:${notice.version}`

export const unlessDismissed = (notice: Notice | null, dismissed: string | null): Notice | null =>
  notice !== null && dismissalKey(notice) === dismissed ? null : notice

export const shouldReload = (
  baseline: string | null,
  next: VersionInfo | null,
  dirty: boolean,
): boolean => !dirty && baseline !== null && next !== null && next.running !== baseline

const COMPOSER = '[role="dialog"][aria-label="New comment"]'

export const hasDraft = (doc: { querySelectorAll: (selector: string) => ArrayLike<object> }) =>
  Array.from(doc.querySelectorAll('textarea')).some(
    (field) => ((field as { value?: string }).value ?? '') !== '',
  ) || doc.querySelectorAll(COMPOSER).length > 0

type Watcher = { fns: Set<() => void>; timer: ReturnType<typeof setInterval> | null }

const watcher: Watcher = { fns: new Set(), timer: null }

export const acquireWatcher = (fn: () => void): (() => void) => {
  watcher.fns.add(fn)
  if (watcher.timer === null) {
    watcher.timer = setInterval(() => {
      watcher.fns.values().next().value?.()
    }, WATCH_EVERY_MS)
  }
  return () => {
    watcher.fns.delete(fn)
    if (watcher.fns.size === 0 && watcher.timer !== null) {
      clearInterval(watcher.timer)
      watcher.timer = null
    }
  }
}

const servedVersion = (): string | null =>
  document.querySelector('meta[name="irsim-version"]')?.getAttribute('content') ?? null

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

const readInfo = async ({
  probe,
  fresh = false,
}: { probe: boolean; fresh?: boolean }): Promise<VersionInfo | null> => {
  const url = probe ? '/api/version?latest=0' : fresh ? '/api/version?fresh=1' : '/api/version'
  const response = await fetch(url, {
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
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const recheck = useRef<((fresh: boolean) => Promise<void>) | null>(null)

  useMountEffect(() => {
    mounted.current = true
    baseline.current = servedVersion()
    setDismissed(readDismissed())
    let release: (() => void) | null = null
    const watch = () => {
      if (document.visibilityState !== 'visible' || phaseRef.current !== 'idle') return
      readInfo({ probe: true })
        .then((next) => {
          if (!mounted.current || phaseRef.current !== 'idle') return
          if (baseline.current === null && next !== null) baseline.current = next.running
          else if (shouldReload(baseline.current, next, hasDraft(document))) window.location.reload()
        })
        .catch(() => {})
    }
    const check = (fresh = false) => {
      const run = readInfo({ probe: false, fresh })
        .then((next) => {
          if (next !== null && baseline.current === null) baseline.current = next.running
          if (!mounted.current || next === null) return
          setInfo(next)
          if (next.canUpdate && release === null) release = acquireWatcher(watch)
        })
        .catch(() => {})
      return run
    }
    recheck.current = check
    void check()
    const timer = setInterval(() => void check(), CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      mounted.current = false
      recheck.current = null
      clearInterval(timer)
      release?.()
    }
  })

  useEffect(() => {
    if (phase !== 'updating') {
      setProgress(null)
      return
    }
    let stopped = false
    const poll = async () => {
      try {
        const response = await fetch('/api/update/progress', { cache: 'no-store' })
        if (!response.ok || stopped) return
        const next = (await response.json()) as UpdateProgress | null
        if (!stopped) setProgress(next)
      } catch {}
    }
    const timer = setInterval(() => void poll(), PROGRESS_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [phase])

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

  return {
    notice,
    phase,
    progress,
    error,
    restartFailed,
    info,
    running: info?.running ?? null,
    /** Asks the release feed now, over the 15 minute poll. */
    check: () => recheck.current?.(true),
    dismiss,
    start,
  }
}
