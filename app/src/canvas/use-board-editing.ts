'use client'

import { useMemo } from 'react'
import type { Camera } from './camera'
import { boardRegion, boundsOf, fitRect, layoutOf } from './geometry'
import type { Selection } from './selection'
import type { PlacedSection } from './sections'
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
 * read the moved boards. A nudge moves every selected frame. It needs the Move tool, selected
 * frames that are not live, and the focus on the viewport or on a frame title; any other focus
 * returns `false` and keeps the key.
 */
export function useBoardEditing({
  camera,
  cameraActions,
  edit,
  selection,
  moving,
  onSelect,
  dropAreas,
  onTarget,
}: {
  camera: Camera
  cameraActions: CameraActions
  edit: Edit
  selection: Selection
  moving: boolean
  onSelect: (name: string) => void
  dropAreas?: (() => PlacedSection[]) | undefined
  onTarget?: ((id: string | null) => void) | undefined
}) {
  const { boards } = edit
  const placedLayout = useMemo(() => layoutOf(boards), [boards])
  const selectedRects = useMemo(
    () => boards.filter((board) => selection.names.includes(board.name)),
    [boards, selection.names],
  )
  const selectedRect = selectedRects.length === 1 ? selectedRects[0] : undefined
  const frameEdit = useFrameEdit({
    camera,
    boards,
    enabled: moving,
    selected: selection.names,
    onSelect,
    onPreview: edit.preview,
    onCommit: edit.commit,
    ...(dropAreas ? { dropAreas } : {}),
    ...(onTarget ? { onTarget } : {}),
  })

  const actions = useMemo(
    () => ({
      ...cameraActions,
      fit: () => camera.go(fitRect(placedLayout.all, camera.size)),
      focusBoard: (name: string) => {
        const board = boards.find((candidate) => candidate.name === name)
        if (board) camera.go(fitRect(boardRegion(board), camera.size, FOCUS_PADDING))
      },
      focusBoards: (names: string[]) => {
        const region = boundsOf(
          boards.filter((board) => names.includes(board.name)).map(boardRegion),
        )
        if (region) camera.go(fitRect(region, camera.size, FOCUS_PADDING))
      },
    }),
    [boards, camera, cameraActions, placedLayout],
  )

  const nudges = useMemo(() => {
    const by = (dx: number, dy: number) => () => {
      const focused = document.activeElement
      const onViewport =
        focused === camera.viewportElement() || focused?.hasAttribute('data-frame-title')
      if (!moving || selection.interacting || selectedRects.length === 0 || !onViewport)
        return false
      edit.nudge(selectedRects, dx, dy)
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
  }, [camera, edit, moving, selectedRects, selection.interacting])

  return { placedLayout, selectedRect, selectedRects, frameEdit, actions, nudges }
}
