'use client'

import { useEffect, useState } from 'react'

const NOTICE_MS = 4000

/** A message for `Toast` that clears itself after four seconds. */
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null)
  // Clears the message on a timer, an external system.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])
  return [notice, setNotice] as const
}

/** A short error line at the bottom centre of the viewport. It does not take the pointer. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm text-destructive shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
    >
      {message}
    </div>
  )
}
