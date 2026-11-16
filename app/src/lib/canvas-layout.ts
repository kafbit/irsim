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
export const SECTION_COLORS = ['gray', 'blue', 'green', 'amber', 'purple', 'red'] as const
export type SectionColor = (typeof SECTION_COLORS)[number]
export const MAX_SECTION_DEPTH = 3
export type SectionEntry = {
  id: string
  title: string
  variantOf?: string
  /** The id of the section this one sits in. `null` in an edit takes it out of its parent. */
  parent?: string | null
  color?: SectionColor | null
  /** A stored area. Without it the section fits its boards. `null` clears a stored field. */
  x?: number | null
  y?: number | null
  width?: number | null
  height?: number | null
}
export type CanvasEdit = {
  boards?: BoardEdit[]
  sections?: { set?: SectionEntry[]; remove?: string[] }
}

const withParent = (entry: SectionEntry, parent: string | null): SectionEntry => ({
  ...entry,
  parent,
})

/** Drops a `null` parent or color, which an edit uses to clear the field. */
const clean = (entry: SectionEntry): SectionEntry => {
  const { parent, color, x, y, width, height, ...rest } = entry
  const stored = [x, y, width, height].every((value) => Number.isFinite(value))
  return {
    ...rest,
    ...(parent ? { parent } : {}),
    ...(color && color !== 'gray' ? { color } : {}),
    ...(stored
      ? {
          x: Math.round(x as number),
          y: Math.round(y as number),
          width: Math.round(width as number),
          height: Math.round(height as number),
        }
      : {}),
  }
}

/** The first problem in `sections`: a bad color, a missing parent, a cycle or more than 3 levels. */
export function validateSections(sections: SectionEntry[]): string | null {
  const byId = new Map(sections.map((entry) => [entry.id, entry]))
  for (const entry of sections) {
    if (entry.color != null && !(SECTION_COLORS as readonly string[]).includes(entry.color)) {
      return `section ${entry.id} has an unknown color ${String(entry.color)}`
    }
    const given = [entry.x, entry.y, entry.width, entry.height].filter(
      (value) => value !== undefined && value !== null,
    )
    if (given.length > 0 && given.length < 4) {
      return `section ${entry.id} needs x, y, width and height together`
    }
    if (given.some((value) => !Number.isFinite(value))) {
      return `the area of section ${entry.id} must be finite numbers`
    }
    if (given.length === 4 && ((entry.width as number) <= 0 || (entry.height as number) <= 0)) {
      return `section ${entry.id} needs a positive width and height`
    }
    let depth = 1
    const seen = new Set([entry.id])
    let parent = entry.parent ?? null
    while (parent !== null) {
      const next = byId.get(parent)
      if (!next) return `section ${entry.id} has no parent named ${parent}`
      if (seen.has(parent)) return `section ${entry.id} is its own ancestor`
      seen.add(parent)
      depth += 1
      if (depth > MAX_SECTION_DEPTH) {
        return `sections nest at most ${MAX_SECTION_DEPTH} levels, ${entry.id} is deeper`
      }
      parent = next.parent ?? null
    }
  }
  return null
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
  // Children of a removed section move up to its parent.
  const parentOf = new Map(sections.map((candidate) => [candidate.id, candidate.parent ?? null]))
  sections = sections
    .filter((candidate) => !removed.has(candidate.id))
    .map((candidate) => {
      let parent = candidate.parent ?? null
      while (parent !== null && removed.has(parent)) parent = parentOf.get(parent) ?? null
      return parent === (candidate.parent ?? null) ? candidate : withParent(candidate, parent)
    })
  const invalid = validateSections(sections)
  if (invalid) return { error: invalid, status: 400 }
  sections = sections.map(clean)
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
      // The minimum applies to a size the edit sets; moving a board that is already smaller (a
      // 48 px bar, say) is allowed and keeps its size.
      const sizing = 'width' in patch || 'height' in patch
      if (
        sizing &&
        ((next.width as number) < MIN_BOARD_WIDTH || (next.height as number) < MIN_BOARD_HEIGHT)
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
