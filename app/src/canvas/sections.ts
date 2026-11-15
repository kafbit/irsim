import type { CanvasEdit } from '../lib/canvas-layout'
import { boardRegion, boundsOf, type Rect } from './geometry'
import type { CanvasSection } from './types'

export const SECTION_PAD = 64
export const SECTION_LABEL = 40
const MIN_LABEL_SCALE = 0.25

type Member = Rect & { name: string; section?: string | undefined }

export type SectionState = { sections: CanvasSection[]; sectionOf: Record<string, string> }

export type PlacedSection = { section: CanvasSection; members: string[]; bounds: Rect }

export const membersOf = (id: string, boards: Member[]): string[] =>
  boards.filter((board) => board.section === id).map((board) => board.name)

/**
 * The member boards with their frame titles, `SECTION_PAD` out on every side and the label strip
 * more above. The label is 40 screen pixels high, so the strip is 40 world units at zoom 1 and
 * grows as the zoom falls, down to a zoom of 0.25. `null` for a section with no boards.
 */
export function sectionBounds(section: CanvasSection, boards: Member[], k = 1): Rect | null {
  const bounds = boundsOf(boards.filter((board) => board.section === section.id).map(boardRegion))
  if (!bounds) return null
  const strip = SECTION_LABEL / Math.min(1, Math.max(k, MIN_LABEL_SCALE))
  return {
    x: bounds.x - SECTION_PAD,
    y: bounds.y - SECTION_PAD - strip,
    width: bounds.width + SECTION_PAD * 2,
    height: bounds.height + SECTION_PAD * 2 + strip,
  }
}

/** The sections that have boards, in section order. A section without boards is not drawn. */
export function placedSections(
  sections: CanvasSection[],
  boards: Member[],
  k = 1,
): PlacedSection[] {
  const placed: PlacedSection[] = []
  for (const section of sections) {
    const bounds = sectionBounds(section, boards, k)
    if (bounds) placed.push({ section, members: membersOf(section.id, boards), bounds })
  }
  return placed
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

/**
 * The section part of `edit` applied to `state`, the way `applyEdit` applies it on the server:
 * upserts merge into an existing section, removals clear their members, and a board joins only a
 * section that exists. The same object when nothing changes.
 */
export function applySectionEdit(state: SectionState, edit: CanvasEdit): SectionState {
  const touches =
    edit.sections !== undefined || (edit.boards ?? []).some((item) => item.section !== undefined)
  if (!touches) return state
  let sections = state.sections
  const removed = new Set(edit.sections?.remove ?? [])
  for (const entry of edit.sections?.set ?? []) {
    const index = sections.findIndex((candidate) => candidate.id === entry.id)
    sections =
      index === -1
        ? [...sections, entry]
        : sections.map((candidate, at) => (at === index ? { ...candidate, ...entry } : candidate))
    removed.delete(entry.id)
  }
  sections = sections.filter((candidate) => !removed.has(candidate.id))
  const ids = new Set(sections.map((candidate) => candidate.id))
  const sectionOf = { ...state.sectionOf }
  for (const item of edit.boards ?? []) {
    if (item.section === null) delete sectionOf[item.name]
    else if (item.section !== undefined && ids.has(item.section))
      sectionOf[item.name] = item.section
  }
  for (const [name, id] of Object.entries(sectionOf)) if (!ids.has(id)) delete sectionOf[name]
  return { sections, sectionOf }
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
): { section: CanvasSection; before: CanvasEdit; after: CanvasEdit } {
  const section = {
    id: newSectionId(sections.map((candidate) => candidate.id)),
    title: defaultTitle(sections),
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
): { before: CanvasEdit; after: CanvasEdit } {
  return {
    before: {
      sections: { set: [section] },
      boards: membersOf(section.id, boards).map((name) => ({ name, section: section.id })),
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
