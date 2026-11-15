'use client'

import { type PointerEvent, useCallback, useMemo, useRef } from 'react'
import type { Camera } from './camera'
import type { Layout, Rect } from './geometry'
import { visibleWorld } from './geometry'
import { centerOn, fromMinimap, minimapMap, toMinimap } from './navigation'
import { useMountEffect } from './use-mount-effect'

const WIDTH = 200
const MAX_HEIGHT = 140

/**
 * A 200 px map of the page: every board as a rectangle, the viewport as an outline. Pressing or
 * dragging on it centres the camera on that point. The viewport outline is moved by the camera,
 * not by React.
 */
export function Minimap({
  camera,
  layout,
  sections,
  selected,
}: {
  camera: Camera
  layout: Layout
  sections: Rect[]
  selected: string[]
}) {
  const map = useMemo(() => minimapMap(layout.all, WIDTH, MAX_HEIGHT), [layout])
  const outline = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useMountEffect(() =>
    camera.subscribe((view, size) => {
      const element = outline.current
      if (!element || size.width === 0) return
      const rect = toMinimap(map, visibleWorld(view, size))
      element.style.width = `${rect.width}px`
      element.style.height = `${rect.height}px`
      element.style.transform = `translate(${rect.x}px, ${rect.y}px)`
    }),
  )

  const aim = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const point = fromMinimap(map, event.clientX - bounds.left, event.clientY - bounds.top)
      camera.move(centerOn(camera.view, camera.size, point.x, point.y))
    },
    [camera, map],
  )

  return (
    <div
      role="presentation"
      className="relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
      style={{ width: map.width, height: map.height }}
      onPointerDown={(event) => {
        event.stopPropagation()
        camera.stop()
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        aim(event)
      }}
      onPointerMove={(event) => dragging.current && aim(event)}
      onPointerUp={(event) => {
        dragging.current = false
        event.currentTarget.releasePointerCapture(event.pointerId)
        camera.settle()
      }}
    >
      {sections.map((bounds) => {
        const rect = toMinimap(map, bounds)
        return (
          <div
            key={`${bounds.x}:${bounds.y}`}
            className="absolute start-0 top-0 border border-border"
            style={{
              width: Math.max(1, rect.width),
              height: Math.max(1, rect.height),
              transform: `translate(${rect.x}px, ${rect.y}px)`,
            }}
          />
        )
      })}
      {layout.boards.map((board) => {
        const rect = toMinimap(map, board)
        return (
          <div
            key={board.name}
            className={`absolute start-0 top-0 rounded-xs ${
              selected.includes(board.name) ? 'bg-foreground' : 'bg-muted-foreground/35'
            }`}
            style={{
              width: Math.max(1, rect.width),
              height: Math.max(1, rect.height),
              transform: `translate(${rect.x}px, ${rect.y}px)`,
            }}
          />
        )
      })}
      <div
        ref={outline}
        className="pointer-events-none absolute start-0 top-0 border border-foreground bg-foreground/5"
      />
    </div>
  )
}
