'use client'

import { useEffect } from 'react'
import type { Camera } from './camera'
import type { PlacedBoard } from './geometry'
import { visibleWorld } from './geometry'

/**
 * Sets `data-culled` on the `[data-board]` elements that are more than one viewport away from the
 * visible world, and only on the elements whose state changed. It runs outside React on every drawn view.
 */
export function useCulling(camera: Camera, boards: PlacedBoard[]) {
  useEffect(() => {
    const culled = new Set<string>()
    const element = (name: string) =>
      camera
        .worldElement()
        ?.querySelector<HTMLElement>(`:scope > [data-board="${CSS.escape(name)}"]`)
    const unsubscribe = camera.subscribe((view, size) => {
      if (size.width === 0 || size.height === 0) return
      const world = visibleWorld(view, size)
      const left = world.x - world.width
      const right = world.x + 2 * world.width
      const top = world.y - world.height
      const bottom = world.y + 2 * world.height
      for (const board of boards) {
        const away =
          board.x + board.width < left ||
          board.x > right ||
          board.y + board.height < top ||
          board.y > bottom
        if (away === culled.has(board.name)) continue
        if (away) culled.add(board.name)
        else culled.delete(board.name)
        element(board.name)?.toggleAttribute('data-culled', away)
      }
    })
    return () => {
      unsubscribe()
      for (const name of culled) element(name)?.removeAttribute('data-culled')
    }
  }, [camera, boards])
}
