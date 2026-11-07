'use client'

import { useCallback } from 'react'
import type { Layout, Size, View } from './geometry'
import { useCamera } from './use-camera'
import { useGestures } from './use-gestures'

type Options = {
  layout: Layout
  pageId: string
  focus: string | null
  hand: boolean
  onCommit: (view: View, size: Size) => void
  onTap: (board: string | null, double: boolean) => void
}

/**
 * The viewport's camera and gestures as one hook. `viewportRef` attaches the camera and the wheel
 * listener; `worldRef` is the scaled layer that holds the frames.
 */
export function useViewport({ layout, pageId, focus, hand, onCommit, onTap }: Options) {
  const {
    camera,
    view,
    viewportRef: attachCamera,
    worldRef,
    actions,
  } = useCamera({
    layout,
    pageId,
    focus,
    onCommit,
  })
  const { wheelRef, setSpace, handlers } = useGestures({ camera, hand, onTap })

  const viewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      const detachCamera = attachCamera(element)
      const detachWheel = wheelRef(element)
      return () => {
        detachCamera?.()
        detachWheel?.()
      }
    },
    [attachCamera, wheelRef],
  )

  return { camera, view, viewportRef, worldRef, handlers, actions, setSpace }
}
