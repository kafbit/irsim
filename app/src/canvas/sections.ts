import { type CanvasEdit, MAX_SECTION_DEPTH } from '../lib/canvas-layout'
import { boardRegion, boundsOf, type Rect } from './geometry'
import type { CanvasSection } from './types'

export const SECTION_PAD = 64
/** The label pill is 26 screen pixels high and sits outside the area, above its top left corner. */
export const SECTION_LABEL = 26

type Member = Rect & { name: string; section?: string | undefined }

export type SectionState = { sections: CanvasSection[]; sectionOf: Record<string, string> }

export type PlacedSection = {
  section: CanvasSection
  /** Every board in the section and in its sub-sections. */
  members: string[]
  bounds: Rect
  /** The smallest the area can be resized to: the boards and sub-sections, padded. */
  fit: Rect
  /** 0 for a top level section. */
  depth: number
  /** Boards the section holds itself, not in its sub-sections. */
  own: number
  /** The section's own color; `null` for none: gray at the top level, `--card` in a parent. */
  color: NonNullable<CanvasSection['color']> | null
}

/** `id` and every section below it. */
export const subtreeOf = (id: string, sections: CanvasSection[]): string[] => {
  const ids = [id]
  for (const next of ids) {
    for (const section of sections) {
      if (section.parent === next && !ids.includes(section.id)) ids.push(section.id)
    }
  }
  return ids
}

export const membersOf = (id: string, boards: Member[], sections: CanvasSection[] = []): string[] => {
  const ids = new Set(subtreeOf(id, sections))
  return boards.filter((board) => board.section && ids.has(board.section)).map((board) => board.name)
}

/**
 * The member boards with their frame titles and the areas of the sub-sections, `SECTION_PAD` out
 * on every side. The label is outside the area, so nothing is added for it. A sub-section is
 * padded the same, so a parent area always holds the child area with a margin. `null` for a section
 * with nothing in it.
 */
export function sectionBounds(
  section: CanvasSection,
  boards: Member[],
  sections: CanvasSection[] = [section],
): Rect | null {
  const fit = sectionFit(section, boards, sections)
  const stored = storedRect(section)
  if (!stored) return fit
  return fit ? (boundsOf([stored, fit]) ?? stored) : stored
}

/** The area stored in `canvas.json`, when the section has one. */
export const storedRect = (section: CanvasSection): Rect | null =>
  section.x !== undefined &&
  section.y !== undefined &&
  section.width !== undefined &&
  section.height !== undefined
    ? { x: section.x, y: section.y, width: section.width, height: section.height }
    : null

/**
 * The smallest area that holds the section's boards and its sub-sections, padded. A stored area
 * is never smaller than this, so resizing cannot cut a member out.
 */
export function sectionFit(
  section: CanvasSection,
  boards: Member[],
  sections: CanvasSection[] = [section],
  seen: ReadonlySet<string> = new Set(),
): Rect | null {
  if (seen.has(section.id)) return null
  const path = new Set(seen).add(section.id)
  const parts: Rect[] = boards.filter((board) => board.section === section.id).map(boardRegion)
  for (const child of sections) {
    if (child.parent !== section.id) continue
    const area = sectionBounds2(child, boards, sections, path)
    if (area) parts.push(area)
  }
  const bounds = boundsOf(parts)
  if (!bounds) return null
  return {
    x: bounds.x - SECTION_PAD,
    y: bounds.y - SECTION_PAD,
    width: bounds.width + SECTION_PAD * 2,
    height: bounds.height + SECTION_PAD * 2,
  }
}

/** A sub-section's drawn area, stored rect included, for its parent's fit. */
function sectionBounds2(
  section: CanvasSection,
  boards: Member[],
  sections: CanvasSection[],
  seen: ReadonlySet<string>,
): Rect | null {
  const fit = sectionFit(section, boards, sections, seen)
  const stored = storedRect(section)
  if (!stored) return fit
  return fit ? (boundsOf([stored, fit]) ?? stored) : stored
}

const depthOf = (section: CanvasSection, sections: CanvasSection[]) =>
  ancestorsOf(section.id, sections).length

/**
 * The sections that have something in them, parents before children so a child draws on top of
 * its parent. A section with nothing in it is not drawn.
 */
export function placedSections(sections: CanvasSection[], boards: Member[]): PlacedSection[] {
  const placed: PlacedSection[] = []
  for (const section of sections) {
    const bounds = sectionBounds(section, boards, sections)
    const fit = sectionFit(section, boards, sections)
    const members = membersOf(section.id, boards, sections)
    // A stored area alone does not draw a section: it needs a board somewhere in it.
    if (!bounds || !fit || members.length === 0) continue
    const color = section.color ?? null
    placed.push({
      section,
      members,
      bounds,
      fit,
      own: boards.filter((board) => board.section === section.id).length,
      depth: depthOf(section, sections),
      color,
    })
  }
  return placed.sort((a, b) => a.depth - b.depth)
}

export function newSectionId(existing: string[]): string {
  const taken = new Set(existing)
  let index = existing.length + 1
  while (taken.has(`section-${index}`)) index += 1
  return `section-${index}`
}

export function defaultTitle(sections: CanvasSection[]): string {
  const titles = new Set(sections.map((section) => section.title))
  let index = sections.length + 1
  while (titles.has(`Section ${index}`)) index += 1
  return `Section ${index}`
}

export function initialSectionState(
  sections: CanvasSection[],
  boards: { name: string; section?: string | undefined }[],
): SectionState {
  const sectionOf: Record<string, string> = {}
  for (const board of boards) if (board.section) sectionOf[board.name] = board.section
  return { sections, sectionOf }
}

/** Drops a cleared (`null`, empty or gray) parent or color, as the server does. */
type Loose = Omit<CanvasSection, 'parent' | 'color' | 'x' | 'y' | 'width' | 'height'> & {
  parent?: string | null | undefined
  color?: CanvasSection['color'] | null | undefined
  x?: number | null | undefined
  y?: number | null | undefined
  width?: number | null | undefined
  height?: number | null | undefined
}
const tidy = (section: Loose): CanvasSection => {
  const { parent, color, x, y, width, height, ...rest } = section
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

/** The ancestors of `id`, nearest first. */
export const ancestorsOf = (id: string, sections: CanvasSection[]): string[] => {
  const byId = new Map(sections.map((section) => [section.id, section]))
  const chain: string[] = []
  let parent = byId.get(id)?.parent
  while (parent && !chain.includes(parent)) {
    chain.push(parent)
    parent = byId.get(parent)?.parent
  }
  return chain
}

/**
 * The section part of `edit` applied to `state`, the way `applyEdit` applies it on the server:
 * upserts merge into an existing section, removals clear their members, and a board joins only a
 * section that exists. The same object when nothing changes.
 */
export function applySectionEdit(state: SectionState, edit: CanvasEdit): SectionState {
  const touches =
    edit.sections !== undefined || (edit.boards ?? []).some((item) => item.section !== undefined)
  if (!touches) return state
  let sections: Loose[] = state.sections
  const removed = new Set(edit.sections?.remove ?? [])
  for (const entry of edit.sections?.set ?? []) {
    const index = sections.findIndex((candidate) => candidate.id === entry.id)
    sections =
      index === -1
        ? [...sections, entry]
        : sections.map((candidate, at) => (at === index ? { ...candidate, ...entry } : candidate))
    removed.delete(entry.id)
  }
  const parentOf = new Map(sections.map((candidate) => [candidate.id, candidate.parent ?? null]))
  sections = sections
    .filter((candidate) => !removed.has(candidate.id))
    .map((candidate) => {
      let parent = candidate.parent ?? null
      while (parent !== null && removed.has(parent)) parent = parentOf.get(parent) ?? null
      return parent === (candidate.parent ?? null) ? candidate : { ...candidate, parent }
    })
    .map(tidy)
  const ids = new Set(sections.map((candidate) => candidate.id))
  const sectionOf = { ...state.sectionOf }
  for (const item of edit.boards ?? []) {
    if (item.section === null) delete sectionOf[item.name]
    else if (item.section !== undefined && ids.has(item.section))
      sectionOf[item.name] = item.section
  }
  for (const [name, id] of Object.entries(sectionOf)) if (!ids.has(id)) delete sectionOf[name]
  return { sections: sections.map(tidy), sectionOf }
}

/** `boards` with `section` read from `sectionOf`; a board that already agrees keeps its object. */
export function withMembership<T extends { name: string; section?: string | undefined }>(
  boards: T[],
  sectionOf: Record<string, string>,
): T[] {
  return boards.map((board) => {
    const section = sectionOf[board.name]
    if (board.section === section) return board
    const { section: _dropped, ...rest } = board
    return (section === undefined ? rest : { ...rest, section }) as T
  })
}

/** The edits that put `names` into a new section and take them back out. */
export function createSectionEdits(
  names: string[],
  boards: Member[],
  sections: CanvasSection[],
  nested = true,
): { section: CanvasSection; before: CanvasEdit; after: CanvasEdit } {
  // Boards that all sit in one section make a sub-section of it, unless that is the third level.
  const shared = sharedSection(names, boards)
  const parent =
    nested && typeof shared === 'string' && ancestorsOf(shared, sections).length + 1 < MAX_SECTION_DEPTH
      ? shared
      : undefined
  const section: CanvasSection = {
    id: newSectionId(sections.map((candidate) => candidate.id)),
    title: defaultTitle(sections),
    ...(parent ? { parent } : {}),
  }
  return {
    section,
    before: {
      sections: { remove: [section.id] },
      boards: names.map((name) => ({
        name,
        section: boards.find((board) => board.name === name)?.section ?? null,
      })),
    },
    after: {
      sections: { set: [section] },
      boards: names.map((name) => ({ name, section: section.id })),
    },
  }
}

/** The edits that give `names` the section `id` (`null` for none) and restore their sections. */
export function assignEdits(
  names: string[],
  boards: Member[],
  id: string | null,
): { before: CanvasEdit; after: CanvasEdit } {
  return {
    before: {
      boards: names.map((name) => ({
        name,
        section: boards.find((board) => board.name === name)?.section ?? null,
      })),
    },
    after: { boards: names.map((name) => ({ name, section: id })) },
  }
}

/** The edits that delete `section` and bring it back with its members. */
export function deleteSectionEdits(
  section: CanvasSection,
  boards: Member[],
  sections: CanvasSection[] = [],
): { before: CanvasEdit; after: CanvasEdit } {
  const children = sections.filter((candidate) => candidate.parent === section.id)
  return {
    before: {
      sections: {
        set: [section, ...children.map(({ id }) => ({ id, title: children.find((child) => child.id === id)?.title ?? id, parent: section.id }))],
      },
      boards: boards
        .filter((board) => board.section === section.id)
        .map((board) => ({ name: board.name, section: section.id })),
    },
    after: { sections: { remove: [section.id] } },
  }
}

export function renameEdits(
  section: CanvasSection,
  title: string,
): { before: CanvasEdit; after: CanvasEdit } {
  return {
    before: { sections: { set: [{ id: section.id, title: section.title }] } },
    after: { sections: { set: [{ id: section.id, title }] } },
  }
}

/** The section the boards share, `undefined` when they differ and `null` when none of them has one. */
export function sharedSection(
  names: string[],
  boards: { name: string; section?: string | undefined }[],
): string | null | undefined {
  const ids = new Set(
    names.map((name) => boards.find((board) => board.name === name)?.section ?? null),
  )
  if (ids.size !== 1) return undefined
  return [...ids][0] ?? null
}

/** The edits that give `section` a color (`null` for the default gray) and put its old one back. */
export function colorEdits(
  section: CanvasSection,
  color: NonNullable<CanvasSection['color']> | null,
): { before: CanvasEdit; after: CanvasEdit } {
  return {
    before: { sections: { set: [{ id: section.id, title: section.title, color: section.color ?? null }] } },
    after: { sections: { set: [{ id: section.id, title: section.title, color }] } },
  }
}

/** The depth of a new sub-section of `id`: whether another level fits under the limit. */
export const canNest = (id: string, sections: CanvasSection[]): boolean =>
  ancestorsOf(id, sections).length + 2 <= MAX_SECTION_DEPTH

/** The center of `rect`. */
const centerOf = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })

/**
 * The innermost section whose area holds the center of `rect`, `null` when none does. `placed`
 * is in drawing order, parents first, so the last hit is the deepest.
 */
export function sectionAt(rect: Rect, placed: PlacedSection[]): string | null {
  const { x, y } = centerOf(rect)
  let hit: string | null = null
  for (const { section, bounds } of placed) {
    if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
      hit = section.id
    }
  }
  return hit
}

/** The edits that give `section` the stored area `rect` and put its old area (or none) back. */
export function resizeSectionEdits(
  section: CanvasSection,
  rect: Rect,
): { before: CanvasEdit; after: CanvasEdit } {
  const old = storedRect(section)
  return {
    before: {
      sections: {
        set: [
          {
            id: section.id,
            title: section.title,
            x: old?.x ?? null,
            y: old?.y ?? null,
            width: old?.width ?? null,
            height: old?.height ?? null,
          },
        ],
      },
    },
    after: { sections: { set: [{ id: section.id, title: section.title, ...rect }] } },
  }
}

/**
 * The section edits that go with moving `id` by `(dx, dy)`: the stored area of the section and of
 * every section below it moves too, so the areas keep their place around the moved boards. `null`
 * when none of them has a stored area.
 */
export function moveSectionEdits(
  id: string,
  sections: CanvasSection[],
  dx: number,
  dy: number,
): { before: CanvasEdit; after: CanvasEdit } | null {
  const moved = subtreeOf(id, sections)
    .map((item) => sections.find((section) => section.id === item))
    .filter((section): section is CanvasSection => section !== undefined && storedRect(section) !== null)
  if (moved.length === 0) return null
  const entry = (section: CanvasSection, rect: Rect) => ({
    id: section.id,
    title: section.title,
    ...rect,
  })
  return {
    before: { sections: { set: moved.map((section) => entry(section, storedRect(section) as Rect)) } },
    after: {
      sections: {
        set: moved.map((section) => {
          const rect = storedRect(section) as Rect
          return entry(section, { ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) })
        }),
      },
    },
  }
}
