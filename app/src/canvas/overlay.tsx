'use client'

// The resize handles are pointer-only: the arrow keys nudge the selected frame from the keyboard.
/* oxlint-disable jsx-a11y/no-static-element-interactions */

import { type PointerEvent, useEffect, useMemo, useRef } from 'react'
import type { Camera } from './camera'
import type { Handle } from './frame-edit'
import type { PlacedBoard, View } from './geometry'

const OUTLINE = 'pointer-events-none absolute start-0 top-0 hidden outline-solid outline-ring'
const MIN_SIDE = 32
const MIN_EDGE = 48

const HANDLES: { handle: Handle; left: string; top: string; cursor: string }[] = [
  { handle: 'nw', left: '0%', top: '0%', cursor: 'cursor-nwse-resize' },
  { handle: 'n', left: '50%', top: '0%', cursor: 'cursor-ns-resize' },
  { handle: 'ne', left: '100%', top: '0%', cursor: 'cursor-nesw-resize' },
  { handle: 'e', left: '100%', top: '50%', cursor: 'cursor-ew-resize' },
  { handle: 'se', left: '100%', top: '100%', cursor: 'cursor-nwse-resize' },
  { handle: 's', left: '50%', top: '100%', cursor: 'cursor-ns-resize' },
  { handle: 'sw', left: '0%', top: '100%', cursor: 'cursor-nesw-resize' },
  { handle: 'w', left: '0%', top: '50%', cursor: 'cursor-ew-resize' },
]

function place(element: HTMLElement | null, board: PlacedBoard | undefined, view: View) {
  if (!element) return
  if (!board) {
    element.style.display = 'none'
    return
  }
  element.style.display = 'block'
  element.style.width = `${board.width * view.k}px`
  element.style.height = `${board.height * view.k}px`
  element.style.transform = `translate(${board.x * view.k + view.x}px, ${board.y * view.k + view.y}px)`
}

/** Edge handles are dropped when their side is too short to hold two 16 px hit areas; all of them when the frame is tiny. */
function placeHandles(element: HTMLElement | null, board: PlacedBoard | undefined, view: View) {
  place(element, board, view)
  if (!element || !board) return
  const width = board.width * view.k
  const height = board.height * view.k
  const tiny = width < MIN_SIDE || height < MIN_SIDE
  for (const child of element.querySelectorAll<HTMLElement>('[data-handle]')) {
    const handle = child.dataset.handle as Handle
    const horizontal = handle === 'n' || handle === 's'
    const vertical = handle === 'e' || handle === 'w'
    const short = (horizontal && width < MIN_EDGE) || (vertical && height < MIN_EDGE)
    child.style.display = tiny || short ? 'none' : 'grid'
  }
}

/**
 * Hover (1 px) and selection (2 px) outlines in screen space, outside the scaled world, so their
 * width does not change with the zoom. The selected frame also gets eight resize handles when
 * `editable`. They follow the camera and the boards through `subscribe`, not through React.
 */
export function Overlay({
  camera,
  boards,
  hovered,
  selected,
  editable,
  onResizeStart,
}: {
  camera: Camera
  boards: PlacedBoard[]
  hovered: string | null
  selected: string | null
  editable: boolean
  onResizeStart: (name: string, handle: Handle, event: PointerEvent<HTMLElement>) => void
}) {
  const byName = useMemo(() => new Map(boards.map((board) => [board.name, board])), [boards])
  const hover = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLDivElement>(null)
  const handles = useRef<HTMLDivElement>(null)

  // Syncs three elements with the camera, an imperative external system; React never writes their geometry.
  useEffect(
    () =>
      camera.subscribe((view) => {
        place(hover.current, hovered === selected ? undefined : byName.get(hovered ?? ''), view)
        place(select.current, byName.get(selected ?? ''), view)
        placeHandles(handles.current, editable ? byName.get(selected ?? '') : undefined, view)
      }),
    [camera, byName, hovered, selected, editable],
  )

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={hover} className={`${OUTLINE} outline-1`} />
      <div ref={select} className={`${OUTLINE} outline-2`} />
      <div ref={handles} className="pointer-events-none absolute start-0 top-0 hidden">
        {HANDLES.map(({ handle, left, top, cursor }) => (
          <div
            key={handle}
            data-handle={handle}
            className={`pointer-events-auto absolute grid size-4 place-items-center ${cursor}`}
            style={{ left, top, transform: 'translate(-50%, -50%)' }}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (selected) onResizeStart(selected, handle, event)
            }}
          >
            <span className="size-2 border border-ring bg-white" />
          </div>
        ))}
      </div>
    </div>
  )
}
