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
  /** 0 for a top level section. */
  depth: number
  /** The color the area takes, the nearest ancestor's when the section has none. */
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
  seen: ReadonlySet<string> = new Set(),
): Rect | null {
  if (seen.has(section.id)) return null
  const path = new Set(seen).add(section.id)
  const parts: Rect[] = boards.filter((board) => board.section === section.id).map(boardRegion)
  for (const child of sections) {
    if (child.parent !== section.id) continue
    const area = sectionBounds(child, boards, sections, path)
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

/** The color a section shows: its own, else the nearest ancestor's, else `null` for gray. */
export const colorOf = (
  section: CanvasSection,
  sections: CanvasSection[],
): NonNullable<CanvasSection['color']> | null =>
  [section.id, ...ancestorsOf(section.id, sections)]
    .map((id) => sections.find((candidate) => candidate.id === id)?.color)
    .find((value) => value !== undefined) ?? null

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
    if (!bounds) continue
    const color = colorOf(section, sections)
    placed.push({
      section,
      members: membersOf(section.id, boards, sections),
      bounds,
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
type Loose = Omit<CanvasSection, 'parent' | 'color'> & {
  parent?: string | null | undefined
  color?: CanvasSection['color'] | null | undefined
}
const tidy = (section: Loose): CanvasSection => {
  const { parent, color, ...rest } = section
  return {
    ...rest,
    ...(parent ? { parent } : {}),
    ...(color && color !== 'gray' ? { color } : {}),
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
