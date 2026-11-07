'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { Camera } from './camera'
import type { PlacedBoard, View } from './geometry'

const OUTLINE = 'pointer-events-none absolute start-0 top-0 hidden outline-solid outline-ring'

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

/**
 * Hover (1 px) and selection (2 px) outlines in screen space, outside the scaled world, so their
 * width does not change with the zoom. They follow the camera through `subscribe`, not through React.
 */
export function Overlay({
  camera,
  boards,
  hovered,
  selected,
}: {
  camera: Camera
  boards: PlacedBoard[]
  hovered: string | null
  selected: string | null
}) {
  const byName = useMemo(() => new Map(boards.map((board) => [board.name, board])), [boards])
  const hover = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLDivElement>(null)

  // Syncs two elements with the camera, an imperative external system; React never writes their geometry.
  useEffect(
    () =>
      camera.subscribe((view) => {
        place(hover.current, hovered === selected ? undefined : byName.get(hovered ?? ''), view)
        place(select.current, byName.get(selected ?? ''), view)
      }),
    [camera, byName, hovered, selected],
  )

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={hover} className={`${OUTLINE} outline-1`} />
      <div ref={select} className={`${OUTLINE} outline-2`} />
    </div>
  )
}
