'use client'

import { useCallback, useRef, useState } from 'react'
import type { PlacedBoard, Size, View } from './geometry'
import {
  advance,
  EMPTY_MOUNTS,
  type MountState,
  type Report,
  settle,
  visibleNames,
} from './mount-policy'
import { useMountEffect } from './use-mount-effect'

type BoardMessage = { type?: unknown; board?: unknown; details?: { message?: unknown } }

const TIMEOUT_CHECK_MS = 1000

/**
 * Owns the mount policy state. `update` takes the committed view and size; the one `message`
 * listener turns a frame's `ready` or `error` into a settled boot and starts the next waiting frame.
 */
// The mount-only listeners read `boards` through a ref, so a moved frame is judged by its new rect.
export function useMounts(boards: PlacedBoard[]) {
  const [state, setState] = useState<MountState>(EMPTY_MOUNTS)
  const boardsRef = useRef(boards)
  boardsRef.current = boards
  const latest = useRef<{ view: View; size: Size }>({
    view: { x: 0, y: 0, k: 1 },
    size: { width: 0, height: 0 },
  })

  const run = useCallback((apply?: (current: MountState) => MountState) => {
    const names = visibleNames(boardsRef.current, latest.current.view, latest.current.size)
    const now = performance.now()
    setState((current) => advance(apply ? apply(current) : current, names, now))
  }, [])

  const update = useCallback(
    (view: View, size: Size) => {
      latest.current = { view, size }
      run()
    },
    [run],
  )

  useMountEffect(() => {
    const onMessage = (event: MessageEvent<BoardMessage>) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (typeof data?.board !== 'string') return
      const name = data.board
      let report: Report
      if (data.type === 'ready') report = { state: 'ready' }
      else if (data.type === 'error') {
        const message = data.details?.message
        report = {
          state: 'error',
          message: typeof message === 'string' ? message : 'The board failed to render',
        }
      } else return
      run((current) => settle(current, name, report))
    }
    window.addEventListener('message', onMessage)
    const timer = window.setInterval(() => run(), TIMEOUT_CHECK_MS)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }
  })

  return { state, update }
}
