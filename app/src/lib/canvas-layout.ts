export const MIN_BOARD_WIDTH = 240
export const MIN_BOARD_HEIGHT = 160

type CanvasBoardEntry = { name: string } & Record<string, unknown>
type CanvasPageEntry = { id: string; sections?: unknown[]; boards: CanvasBoardEntry[] } & Record<string, unknown>
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
  return applyEdit(canvas, page, { boards: [{ name: board, ...next }] })
}

export type BoardEdit = {
  name: string
  x?: number
  y?: number
  width?: number
  height?: number
  section?: string | null
}
export type SectionEntry = { id: string; title: string; variantOf?: string }
export type CanvasEdit = {
  boards?: BoardEdit[]
  sections?: { set?: SectionEntry[]; remove?: string[] }
}

const GEOMETRY = ['x', 'y', 'width', 'height'] as const

/**
 * Returns a copy of `canvas` with `edit` applied to `page`: board geometry (rounded) and section
 * membership, and section upserts and removals. Sections are applied first, so a board can join a
 * section created by the same edit. Fails with 404 for an unknown page or board, and with 400 for a
 * non-finite number, a size under 240 x 160, or a section that does not exist. `canvas` is not mutated.
 */
export function applyEdit(canvas: CanvasFile, page: string, edit: CanvasEdit): Placement {
  const target = canvas.pages.find((candidate) => candidate.id === page)
  if (!target) return { error: `no page named ${page}`, status: 404 }

  let sections = (target.sections ?? []) as SectionEntry[]
  const removed = new Set(edit.sections?.remove ?? [])
  for (const entry of edit.sections?.set ?? []) {
    if (typeof entry?.id !== 'string' || typeof entry.title !== 'string') {
      return { error: 'a section needs a string id and title', status: 400 }
    }
    const index = sections.findIndex((candidate) => candidate.id === entry.id)
    sections =
      index === -1
        ? [...sections, entry]
        : sections.map((candidate, at) => (at === index ? { ...candidate, ...entry } : candidate))
    removed.delete(entry.id)
  }
  const sectionsTouched = edit.sections !== undefined
  sections = sections.filter((candidate) => !removed.has(candidate.id))
  const sectionIds = new Set(sections.map((candidate) => candidate.id))

  const edits = new Map<string, BoardEdit>()
  for (const item of edit.boards ?? []) {
    if (!target.boards.some((candidate) => candidate.name === item.name)) {
      return { error: `no board named ${item.name} on page ${page}`, status: 404 }
    }
    edits.set(item.name, { ...edits.get(item.name), ...item })
  }

  const boards: CanvasBoardEntry[] = []
  for (const board of target.boards) {
    let next: CanvasBoardEntry = board
    const item = edits.get(board.name)
    if (item) {
      const patch: Record<string, number> = {}
      for (const key of GEOMETRY) {
        const value = item[key]
        if (value === undefined) continue
        if (!Number.isFinite(value)) {
          return { error: `${key} of ${board.name} must be a finite number`, status: 400 }
        }
        patch[key] = Math.round(value)
      }
      next = { ...board, ...patch }
      if (
        (next.width as number) < MIN_BOARD_WIDTH ||
        (next.height as number) < MIN_BOARD_HEIGHT
      ) {
        return {
          error: `a board is at least ${MIN_BOARD_WIDTH} wide and ${MIN_BOARD_HEIGHT} high`,
          status: 400,
        }
      }
      if (item.section === null) {
        const { section: _dropped, ...rest } = next
        next = rest as CanvasBoardEntry
      } else if (item.section !== undefined) {
        if (typeof item.section !== 'string' || !sectionIds.has(item.section)) {
          return { error: `no section named ${String(item.section)} on page ${page}`, status: 400 }
        }
        next = { ...next, section: item.section }
      }
    }
    if (typeof next.section === 'string' && removed.has(next.section)) {
      const { section: _dropped, ...rest } = next
      next = rest as CanvasBoardEntry
    }
    boards.push(next)
  }

  const nextPage: CanvasPageEntry = sectionsTouched
    ? { ...target, sections, boards }
    : { ...target, boards }
  return {
    canvas: {
      ...canvas,
      pages: canvas.pages.map((entry) => (entry === target ? nextPage : entry)),
    },
  }
}
