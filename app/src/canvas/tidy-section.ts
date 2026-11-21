import type { CanvasEdit } from '../lib/canvas-layout'
import { editsOf, type Move } from './frame-edit'
import { boundsOf, type Rect, TITLE_BAR } from './geometry'
import { SECTION_PAD, storedRect } from './sections'
import { tidy, type TidyMode } from './tidy'
import type { CanvasSection } from './types'

export const DEFAULT_GAP = 40

export type TidyRequest = {
  mode: TidyMode
  gap: number
  columns?: number
  rows?: number
  width?: number
  originX?: number
  area?: Rect
}

type Member = Rect & { name: string; section?: string | undefined }

const widest = (members: Member[]) => Math.max(0, ...members.map((member) => member.width))

export const directMembers = (id: string, boards: Member[]): Member[] =>
  boards.filter((board) => board.section === id)

export const wrapWidth = (area: Rect, members: Member[]): number =>
  Math.max(area.width - SECTION_PAD * 2, widest(members))

/**
 * The edit that tidies the boards a section holds itself, from the top left of their bounding box
 * (from the left edge of `area` when given),
 * and the edit that puts them back. Sub-sections stay where they are. Wrap stores the layout on the
 * section, every other mode clears it. `area` is stored as the section area in the same edit.
 * `null` when nothing changes.
 */
export function sectionTidyEdits(
  section: CanvasSection,
  boards: Member[],
  request: TidyRequest,
): { before: CanvasEdit; after: CanvasEdit } | null {
  const members = directMembers(section.id, boards)
  const bounds = boundsOf(members)
  if (!bounds) return null
  const { mode, gap, area } = request
  const count = members.length
  const columns =
    request.columns ?? (request.rows ? Math.ceil(count / request.rows) : undefined)
  const positions = tidy(
    members.map(({ name, x, y, width, height }) => ({
      name,
      x,
      y,
      width,
      height: height + TITLE_BAR,
    })),
    { x: request.originX ?? (area ? area.x + SECTION_PAD : bounds.x), y: bounds.y },
    {
      mode,
      gap,
      ...(mode === 'wrap'
        ? { width: request.width ?? (area ? wrapWidth(area, members) : bounds.width) }
        : {}),
      ...(columns === undefined ? {} : { columns }),
    },
  )
  const moves: Move[] = []
  for (const member of members) {
    const next = positions.get(member.name)
    if (!next || (next.x === member.x && next.y === member.y)) continue
    const before = { x: member.x, y: member.y, width: member.width, height: member.height }
    moves.push({ name: member.name, before, rect: { ...before, ...next } })
  }
  const layout = mode === 'wrap' ? { mode: 'wrap' as const, gap } : null
  const layoutChanged =
    (section.layout?.gap ?? null) !== (layout?.gap ?? null) ||
    (section.layout?.mode ?? null) !== (layout?.mode ?? null)
  const old = storedRect(section)
  const areaChanged =
    area !== undefined &&
    (old?.x !== area.x || old?.y !== area.y || old?.width !== area.width || old?.height !== area.height)
  if (moves.length === 0 && !layoutChanged && !areaChanged) return null
  const edits = editsOf(moves)
  const before: CanvasEdit = { ...edits.before }
  const after: CanvasEdit = { ...edits.after }
  if (layoutChanged || areaChanged) {
    const target = { id: section.id, title: section.title }
    before.sections = {
      set: [
        {
          ...target,
          layout: section.layout ?? null,
          ...(areaChanged
            ? {
                x: old?.x ?? null,
                y: old?.y ?? null,
                width: old?.width ?? null,
                height: old?.height ?? null,
              }
            : {}),
        },
      ],
    }
    after.sections = { set: [{ ...target, layout, ...(areaChanged ? area : {}) }] }
  }
  return { before, after }
}

/** The edits that clear the stored layout of `sections`, and put it back. */
export function clearLayoutEdits(
  sections: CanvasSection[],
): { before: CanvasEdit; after: CanvasEdit } | null {
  const laid = sections.filter((section) => section.layout)
  if (laid.length === 0) return null
  return {
    before: {
      sections: { set: laid.map(({ id, title, layout }) => ({ id, title, layout: layout ?? null })) },
    },
    after: { sections: { set: laid.map(({ id, title }) => ({ id, title, layout: null })) } },
  }
}

const whole = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && value.trim() !== ''
    ? Math.min(max, Math.max(min, parsed))
    : fallback
}

export const gridDefaults = (count: number): { columns: number; rows: number } => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) }
}

export const arrangeRequest = (
  mode: TidyMode,
  fields: { gap: string; columns: string; rows: string; width: string },
  count: number,
): TidyRequest => {
  const request: TidyRequest = { mode, gap: whole(fields.gap, DEFAULT_GAP, 0, 400) }
  const limit = Math.max(1, count)
  if (mode === 'grid') {
    const defaults = gridDefaults(count)
    request.columns = whole(fields.columns, defaults.columns, 1, limit)
    request.rows = whole(fields.rows, Math.ceil(limit / request.columns), 1, limit)
  }
  if (mode === 'wrap') request.width = whole(fields.width, 1200, 120, 20000)
  return request
}
