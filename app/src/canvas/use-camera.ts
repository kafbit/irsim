'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Camera } from './camera'
import {
  boardRegion,
  fitRect,
  focusRect,
  type Layout,
  type Rect,
  type Size,
  type View,
  zoomAtCenter,
} from './geometry'
import { stepZoom } from './navigation'
import { readStoredView, writeStoredView } from './view-storage'

const ORIGIN: View = { x: 0, y: 0, k: 1 }
export const FOCUS_PADDING = 80

type Options = {
  layout: Layout
  pageId: string
  focus: string | null
  onCommit: (view: View, size: Size) => void
}

/**
 * Owns the `Camera`, the committed view React renders from, and the first fit: the focused board,
 * else the view stored for this page, else the whole page. Every action animates.
 */
export function useCamera({ layout, pageId, focus, onCommit }: Options) {
  const [view, setView] = useState<View>(ORIGIN)
  const [camera] = useState(
    () =>
      new Camera((next, size) => {
        setView(next)
        writeStoredView(pageId, next)
        onCommit(next, size)
      }),
  )
  const fitted = useRef(false)

  const viewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      camera.setViewport(element)
      if (!element) return
      const measure = () => {
        camera.size = { width: element.clientWidth, height: element.clientHeight }
        if (camera.size.width === 0) return
        if (fitted.current) return camera.settle()
        fitted.current = true
        const board = layout.boards.find((candidate) => candidate.name === focus)
        camera.jump(
          (board && fitRect(boardRegion(board), camera.size, FOCUS_PADDING)) ||
            readStoredView(pageId) ||
            fitRect(layout.all, camera.size),
        )
      }
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => {
        observer.disconnect()
        camera.detach()
      }
    },
    [camera, focus, layout, pageId],
  )

  const worldRef = useCallback(
    (element: HTMLDivElement | null) => camera.setWorld(element),
    [camera],
  )

  const actions = useMemo(() => {
    const zoomTo = (k: number) => camera.go(zoomAtCenter(camera.target, k, camera.size))
    const focusBoard = (name: string) => {
      const board = layout.boards.find((candidate) => candidate.name === name)
      if (board) camera.go(fitRect(boardRegion(board), camera.size, FOCUS_PADDING))
    }
    return {
      zoomTo,
      zoomStep: (direction: 1 | -1) => zoomTo(stepZoom(camera.target.k, direction)),
      actualSize: () => zoomTo(1),
      fit: () => camera.go(fitRect(layout.all, camera.size)),
      focusBoard,
      focusRect: (rect: Rect) => camera.go(focusRect(rect, camera.size, camera.target.k)),
    }
  }, [camera, layout])

  return { camera, view, viewportRef, worldRef, actions }
}
