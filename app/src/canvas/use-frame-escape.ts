'use client'

import { useEffect, useRef } from 'react'
import { useMountEffect } from './use-mount-effect'

type EscapeMessage = { type?: unknown; board?: unknown }

/** A live frame has the keyboard focus, so it forwards Esc as `{ type: 'escape' }`; the latest `onEscape` runs for it. */
export function useFrameEscape(onEscape: () => void) {
  const latest = useRef(onEscape)
  useEffect(() => {
    latest.current = onEscape
  })
  useMountEffect(() => {
    const onMessage = (event: MessageEvent<EscapeMessage>) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'escape' && typeof event.data.board === 'string') latest.current()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })
}
