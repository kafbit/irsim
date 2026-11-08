export const MIN_BOARD_WIDTH = 240
export const MIN_BOARD_HEIGHT = 160

type CanvasBoardEntry = { name: string } & Record<string, unknown>
type CanvasPageEntry = { id: string; boards: CanvasBoardEntry[] } & Record<string, unknown>
export type CanvasFile = { pages: CanvasPageEntry[] } & Record<string, unknown>

export type RectInput = { x: unknown; y: unknown; width: unknown; height: unknown }
export type Placement = { canvas: CanvasFile } | { error: string; status: 400 | 404 }

/**
 * Returns a copy of `canvas` with the board's x, y, width and height replaced by `rect`, rounded to
 * integers. Nothing else changes, key order included. Fails with 400 for a non-finite number or a
 * size under 240 x 160, and with 404 for an unknown page or board. `canvas` is not mutated.
 */
export function placeBoard(
  canvas: CanvasFile,
  page: string,
  board: string,
  rect: RectInput,
): Placement {
  const { x, y, width, height } = rect
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return { error: 'x, y, width and height must be finite numbers', status: 400 }
  }
  const next = {
    x: Math.round(x as number),
    y: Math.round(y as number),
    width: Math.round(width as number),
    height: Math.round(height as number),
  }
  if (next.width < MIN_BOARD_WIDTH || next.height < MIN_BOARD_HEIGHT) {
    return {
      error: `a board is at least ${MIN_BOARD_WIDTH} wide and ${MIN_BOARD_HEIGHT} high`,
      status: 400,
    }
  }
  const target = canvas.pages.find((candidate) => candidate.id === page)
  if (!target) return { error: `no page named ${page}`, status: 404 }
  if (!target.boards.some((candidate) => candidate.name === board)) {
    return { error: `no board named ${board} on page ${page}`, status: 404 }
  }
  return {
    canvas: {
      ...canvas,
      pages: canvas.pages.map((entry) =>
        entry === target
          ? {
              ...entry,
              boards: entry.boards.map((candidate) =>
                candidate.name === board ? { ...candidate, ...next } : candidate,
              ),
            }
          : entry,
      ),
    },
  }
}
