'use client'

import { useCallback, useEffect, useState } from 'react'

const NOTICE_MS = 4000

export type Tone = 'error' | 'info'
export type Notice = { message: string; tone: Tone }

/** A message for `Toast` that clears itself after four seconds. The tone defaults to `error`. */
export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)
  // Clears the message on a timer, an external system.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])
  const show = useCallback(
    (message: string | null, tone: Tone = 'error') =>
      setNotice(message === null ? null : { message, tone }),
    [],
  )
  return [notice, show] as const
}

/** A short line at the bottom centre of the viewport, red for an error and plain for information. It does not take the pointer. */
export function Toast({ message, tone = 'error' }: { message: string | null; tone?: Tone }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-[0_14px_36px_rgba(20,22,26,0.14)] ${
        tone === 'info' ? 'text-foreground' : 'text-destructive'
      }`}
    >
      {message}
    </div>
  )
}
