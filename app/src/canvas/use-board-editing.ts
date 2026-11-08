'use client'

import { useMemo } from 'react'
import type { Camera } from './camera'
import { boardRegion, fitRect, layoutOf } from './geometry'
import type { Selection } from './selection'
import type { useBoardLayout } from './use-board-layout'
import { FOCUS_PADDING } from './use-camera'
import { useFrameEdit } from './use-frame-edit'

const NUDGE = 10
const NUDGE_FAR = 50

type Edit = ReturnType<typeof useBoardLayout>
type CameraActions = {
  zoomTo: (k: number) => void
  zoomStep: (direction: 1 | -1) => void
  actualSize: () => void
  fit: () => void
  focusBoard: (name: string) => void
}

/**
 * Wires the move, resize and arrow-key nudge of frames to the camera and the selection. The camera
 * hook keeps the layout it was built with, so `actions` replaces its fit and focus with ones that
 * read the moved boards. A nudge needs the Move tool, a selected frame that is not live, and the
 * focus on the viewport or on a frame title; any other focus returns `false` and keeps the key.
 */
export function useBoardEditing({
  camera,
  cameraActions,
  edit,
  selection,
  moving,
  onSelect,
}: {
  camera: Camera
  cameraActions: CameraActions
  edit: Edit
  selection: Selection
  moving: boolean
  onSelect: (name: string) => void
}) {
  const { boards } = edit
  const placedLayout = useMemo(() => layoutOf(boards), [boards])
  const selectedRect = boards.find((board) => board.name === selection.name)
  const frameEdit = useFrameEdit({
    camera,
    boards,
    enabled: moving,
    onSelect,
    onPreview: edit.preview,
    onCommit: edit.commit,
  })

  const actions = useMemo(
    () => ({
      ...cameraActions,
      fit: () => camera.go(fitRect(placedLayout.all, camera.size)),
      focusBoard: (name: string) => {
        const board = boards.find((candidate) => candidate.name === name)
        if (board) camera.go(fitRect(boardRegion(board), camera.size, FOCUS_PADDING))
      },
    }),
    [boards, camera, cameraActions, placedLayout],
  )

  const nudges = useMemo(() => {
    const by = (dx: number, dy: number) => () => {
      const focused = document.activeElement
      const onViewport =
        focused === camera.viewportElement() || focused?.hasAttribute('data-frame-title')
      if (!moving || selection.interacting || !selectedRect || !onViewport) return false
      edit.nudge(selectedRect, dx, dy)
    }
    return {
      'nudge-left': by(-NUDGE, 0),
      'nudge-right': by(NUDGE, 0),
      'nudge-up': by(0, -NUDGE),
      'nudge-down': by(0, NUDGE),
      'nudge-far-left': by(-NUDGE_FAR, 0),
      'nudge-far-right': by(NUDGE_FAR, 0),
      'nudge-far-up': by(0, -NUDGE_FAR),
      'nudge-far-down': by(0, NUDGE_FAR),
    }
  }, [camera, edit, moving, selectedRect, selection.interacting])

  return { placedLayout, selectedRect, frameEdit, actions, nudges }
}
