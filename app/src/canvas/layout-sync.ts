import type { Rect } from './geometry'
import type { CanvasSection } from './types'

type Served = Rect & { name: string; section?: string | undefined }

/** Changes when the server's sections, the set of boards or a board's section changes. A move or resize does not change it. */
export const sectionsKey = (sections: CanvasSection[], boards: Served[]): string =>
  JSON.stringify([sections, boards.map((board) => [board.name, board.section ?? null])])

/** `placed` without the rects the server now reports. The same object when none is dropped. */
export function dropServed(
  placed: Record<string, Rect>,
  boards: Served[],
): Record<string, Rect> {
  const served = new Map(boards.map((board) => [board.name, board]))
  const kept = Object.entries(placed).filter(([name, rect]) => {
    const board = served.get(name)
    return !(
      board &&
      board.x === rect.x &&
      board.y === rect.y &&
      board.width === rect.width &&
      board.height === rect.height
    )
  })
  return kept.length === Object.keys(placed).length ? placed : Object.fromEntries(kept)
}
