'use client'

import { useEffect } from 'react'
import type { Camera } from '../camera'
import { attachFrameInput } from './frame-input'
import { parsePick } from './model'
import type { PickedElement } from './types'

const FRAMES = '[data-board] iframe'

const postMode = (win: Window | null | undefined, on: boolean) =>
  win?.postMessage({ type: 'comment-mode', on }, window.location.origin)

/**
 * While `active`, every mounted frame is told to run its comment mode, and so is each frame that
 * boots later (it announces `ready`). A `pick` from a frame goes to `onPick`, which must be stable.
 * The frames' wheel, middle-drag and tool keys are handed to the camera, see `attachFrameInput`.
 */
export function useCommentMode(
  active: boolean,
  camera: Camera,
  onPick: (pick: PickedElement) => void,
) {
  // Syncs with the frame windows, an external system: the mode is posted to them, and removed on exit.
  useEffect(() => {
    if (!active) return
    const attached = new WeakSet<Window>()
    const cleanups: (() => void)[] = []
    const enter = (win: Window | null | undefined) => {
      const viewport = camera.viewportElement()
      if (!win || !viewport || attached.has(win)) return
      attached.add(win)
      postMode(win, true)
      cleanups.push(attachFrameInput(win, camera, viewport))
    }
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(FRAMES)) {
      enter(frame.contentWindow)
    }
    const onMessage = (event: MessageEvent<{ type?: unknown }>) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'ready') enter(event.source as Window | null)
      else if (event.data?.type === 'pick') {
        const pick = parsePick(event.data)
        if (pick) onPick(pick)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      for (const cleanup of cleanups) cleanup()
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(FRAMES)) {
        postMode(frame.contentWindow, false)
      }
    }
  }, [active, camera, onPick])
}
