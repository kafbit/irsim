import { findOverlaps, GAP, placeAtEnd, resolveCollisions, TITLE_BAR } from './board-placement.mjs'

export const MIN_BOARD_WIDTH = 240
export const MIN_BOARD_HEIGHT = 160
/** The margin the canvas draws around the boards of a section. */
export const SECTION_PAD = 64

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
  layout?: { mode: 'wrap'; gap: number } | null
}
export type PageEdit = { title?: string; icon?: string | null }
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
  const { parent, color, x, y, width, height, layout, ...rest } = entry
  const stored = [x, y, width, height].every((value) => Number.isFinite(value))
  return {
    ...rest,
    ...(parent ? { parent } : {}),
    ...(layout ? { layout: { mode: layout.mode, gap: Math.round(layout.gap) } } : {}),
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
    if (entry.layout != null) {
      const { mode, gap } = entry.layout
      if (mode !== 'wrap') return `section ${entry.id} has an unknown layout mode`
      if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 400) {
        return `the layout gap of section ${entry.id} must be a number from 0 to 400`
      }
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

type PlacedRect = { name: string; x: number; y: number; width: number; height: number; section?: unknown }
type AreaSection = { id: string; parent?: string | null; x?: unknown; y?: unknown; width?: unknown; height?: unknown }

type Box = { x: number; y: number; width: number; height: number }
type Unit = Box & { name: string; members: PlacedRect[] }

const areaOf = (entry: AreaSection): Box | null =>
  [entry.x, entry.y, entry.width, entry.height].every((value) => Number.isFinite(value))
    ? { x: entry.x as number, y: entry.y as number, width: entry.width as number, height: entry.height as number }
    : null

const hull = (items: Box[]): Box => {
  const left = Math.min(...items.map((item) => item.x))
  const top = Math.min(...items.map((item) => item.y))
  const right = Math.max(...items.map((item) => item.x + item.width))
  const bottom = Math.max(...items.map((item) => item.y + item.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const close = (a: Box, b: Box): boolean => findOverlaps([{ name: 'a', ...a }, { name: 'b', ...b }], GAP).length > 0

const drawnRect = (board: Box): Box => ({
  x: board.x,
  y: board.y - TITLE_BAR,
  width: board.width,
  height: board.height + TITLE_BAR,
})

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const sectionIndex = (sections: AreaSection[]) => {
  const ids = new Set(sections.map((entry) => entry.id))
  const parentOf = new Map<string, string | null>(
    sections.map((entry) => [entry.id, typeof entry.parent === 'string' && ids.has(entry.parent) ? entry.parent : null]),
  )
  const known = (id: unknown): id is string => typeof id === 'string' && parentOf.has(id)
  const chain = (id: string | null): string[] => {
    const out: string[] = []
    let at = id
    while (at !== null && !out.includes(at)) {
      out.push(at)
      at = parentOf.get(at) ?? null
    }
    return out
  }
  return { parentOf, known, chain }
}

type SectionIndex = ReturnType<typeof sectionIndex>

/** The area the canvas draws for section `id`, as `sectionBounds` in `canvas/sections.ts` computes it. */
const drawnArea = (
  index: SectionIndex,
  sections: AreaSection[],
  id: string,
  list: PlacedRect[],
  seen: ReadonlySet<string> = new Set(),
): Box | null => {
  if (seen.has(id)) return null
  const path = new Set(seen).add(id)
  const parts: Box[] = list
    .filter((board) => board.section === id)
    .map((board) => ({ x: board.x, y: board.y - TITLE_BAR, width: board.width, height: board.height + TITLE_BAR }))
  for (const entry of sections) {
    if (index.parentOf.get(entry.id) !== id) continue
    const area = drawnArea(index, sections, entry.id, list, path)
    if (area) parts.push(area)
  }
  const fit =
    parts.length > 0
      ? (({ x, y, width, height }: Box) => ({
          x: x - SECTION_PAD,
          y: y - SECTION_PAD,
          width: width + SECTION_PAD * 2,
          height: height + SECTION_PAD * 2,
        }))(hull(parts))
      : null
  const entry = sections.find((candidate) => candidate.id === id)
  const stored = entry ? areaOf(entry) : null
  return fit && stored ? hull([fit, stored]) : (fit ?? stored)
}

/** The units of one container: its own boards as frames, and its child sections as the areas the canvas draws for them. */
const buildUnits = (
  index: SectionIndex,
  sections: AreaSection[],
  container: string | null,
  list: PlacedRect[],
): Unit[] => {
  const slots = new Map<string, PlacedRect[]>()
  const slot = (key: string) => {
    let found = slots.get(key)
    if (!found) {
      found = []
      slots.set(key, found)
    }
    return found
  }
  const childOf = (id: string | null): string | null =>
    index.chain(id).find((candidate) => index.parentOf.get(candidate) === container) ?? null
  for (const board of list) {
    const own = index.known(board.section) ? board.section : null
    if (own === container) {
      slot(`board:${board.name}`).push(board)
      continue
    }
    const child = childOf(own)
    if (child !== null) slot(`section:${child}`).push(board)
  }
  for (const entry of sections) {
    if (index.parentOf.get(entry.id) === container && areaOf(entry)) slot(`section:${entry.id}`)
  }
  const units: Unit[] = []
  for (const [name, members] of slots) {
    if (name.startsWith('board:')) {
      const [board] = members as [PlacedRect]
      units.push({ name, x: board.x, y: board.y, width: board.width, height: board.height, members })
      continue
    }
    const area = drawnArea(index, sections, name.slice('section:'.length), list)
    if (area) units.push({ name, ...area, members })
  }
  return units
}

/**
 * The moves that keep the neighbours of the `edited` boards `GAP` away from them. A container is a
 * section or the page. Each container on the section chain of an edited board resolves its own
 * units, deepest first: its boards, and its child sections as one rect each that covers every board
 * below the section and its stored areas. The units with an edited board stay. A pair that was
 * already closer than `GAP` in `before` is not pushed. `boards` are the new x and y by board name.
 */
export function resolveLayout(
  boards: PlacedRect[],
  sections: AreaSection[],
  edited: Iterable<string>,
  before: PlacedRect[] = boards,
  regrouped: ReadonlySet<string> = new Set(),
): { boards: Map<string, { x: number; y: number }> } {
  const result = { boards: new Map<string, { x: number; y: number }>() }
  const index = sectionIndex(sections)
  const names = new Set(edited)
  const current = new Map(boards.map((board) => [board.name, { ...board }]))
  const containers = new Set<string | null>()
  for (const board of boards) {
    if (!names.has(board.name)) continue
    for (const id of index.chain(index.known(board.section) ? board.section : null)) containers.add(id)
    containers.add(null)
  }
  const depth = (id: string | null) => (id === null ? -1 : index.chain(id).length - 1)
  const order = [...containers].sort((a, b) => depth(b) - depth(a))
  const previous = before.map((board) => ({ ...board, section: current.get(board.name)?.section ?? board.section }))
  for (const container of order) {
    const units = buildUnits(index, sections, container, [...current.values()])
    const touched = new Set(units.filter((unit) => unit.members.some((member) => names.has(member.name))).map((unit) => unit.name))
    if (touched.size === 0) continue
    const wasClose = new Set(
      findOverlaps(buildUnits(index, sections, container, previous), GAP)
        .filter(([a, b]) => ![a, b].some((key) => key.startsWith('section:') && regrouped.has(key.slice('section:'.length))))
        .flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
    )
    const hit = new Set<string>()
    for (const [a, b] of findOverlaps(units, GAP)) {
      if (wasClose.has(`${a}|${b}`)) continue
      if (touched.has(a) && !touched.has(b)) hit.add(b)
      if (touched.has(b) && !touched.has(a)) hit.add(a)
    }
    if (hit.size === 0) continue
    const rects = units.map(({ name, x, y, width, height }) => ({ name, x, y, width, height }))
    const fixed = rects.filter((unit) => !hit.has(unit.name)).map((unit) => unit.name)
    for (const [key, to] of resolveCollisions(rects, fixed, GAP)) {
      const unit = units.find((candidate) => candidate.name === key)
      if (!unit) continue
      for (const member of unit.members) {
        const entry = current.get(member.name)
        if (entry) {
          entry.x += to.x - unit.x
          entry.y += to.y - unit.y
        }
      }
    }
  }
  for (const board of boards) {
    const entry = current.get(board.name)
    if (entry && (entry.x !== board.x || entry.y !== board.y)) result.boards.set(board.name, { x: entry.x, y: entry.y })
  }
  return result
}

/** The board moves of `resolveLayout`. */
export const resolveMoves = (
  boards: PlacedRect[],
  sections: AreaSection[],
  edited: Iterable<string>,
  before: PlacedRect[] = boards,
  regrouped: ReadonlySet<string> = new Set(),
): Map<string, { x: number; y: number }> => resolveLayout(boards, sections, edited, before, regrouped).boards

/** A stored section area shifts with its boards when every board in the section, or in a section below it, moved by the same distance. */
function shiftAreas(
  sections: SectionEntry[],
  before: PlacedRect[],
  after: PlacedRect[],
  skip: Set<string>,
): SectionEntry[] {
  const parentOf = new Map(sections.map((entry) => [entry.id, entry.parent ?? null]))
  const inside = (board: PlacedRect, id: string): boolean => {
    let at = typeof board.section === 'string' ? board.section : null
    for (let depth = 0; at !== null && depth < 10; depth += 1) {
      if (at === id) return true
      at = parentOf.get(at) ?? null
    }
    return false
  }
  const was = new Map(before.map((board) => [board.name, board]))
  let changed = false
  const next = sections.map((entry) => {
    const stored = [entry.x, entry.y, entry.width, entry.height].every((value) => Number.isFinite(value))
    if (!stored || skip.has(entry.id)) return entry
    const members = after.filter((board) => inside(board, entry.id))
    const deltas = members.map((board) => {
      const old = was.get(board.name)
      return old ? { dx: board.x - old.x, dy: board.y - old.y } : null
    })
    const [first] = deltas
    if (!first || (first.dx === 0 && first.dy === 0)) return entry
    if (!deltas.every((delta) => delta && delta.dx === first.dx && delta.dy === first.dy)) return entry
    changed = true
    return { ...entry, x: (entry.x as number) + first.dx, y: (entry.y as number) + first.dy }
  })
  return changed ? next : sections
}

/** For each level above the section, page first, how many units the section newly comes within `GAP` of when `self` is on the page. */
const touchCounts = (
  index: SectionIndex,
  sections: AreaSection[],
  others: PlacedRect[],
  self: PlacedRect,
  id: string,
): number[] => {
  const chain = index.chain(id)
  const containers: (string | null)[] = [null, ...chain.slice(1).reverse()]
  return containers.map((container) => {
    let count = 0
    const key = `section:${chain.find((candidate) => index.parentOf.get(candidate) === container)}`
    const withBoard = buildUnits(index, sections, container, [...others, self])
    const mine = withBoard.find((unit) => unit.name === key)
    if (!mine) return 0
    const withoutBoard = buildUnits(index, sections, container, others)
    const minus = withoutBoard.find((unit) => unit.name === key)
    for (const other of withBoard) {
      if (other.name === key || !close(mine, other)) continue
      const was = withoutBoard.find((unit) => unit.name === other.name)
      if (minus && was && close(minus, was)) continue
      count += 1
    }
    return count
  })
}

const byLevel = (a: number[], b: number[]): number => {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const diff = (a[at] ?? 0) - (b[at] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * The x and y for the board `name` inside its section: right of or below a board of the section or
 * of a section below it, touching the fewest other units, growing the section least. A spot is
 * dropped when it is within `GAP` of a board of the section itself or of a board outside the
 * top-level section of the section, or when its drawn rect overlaps a board that `resolveLayout`
 * does not push away, because their units were already within `GAP` in `before`. When no spot remains, the board goes below the hull of the
 * members. `null` when the board has no known section or the section has no other board.
 */
export function placeInSection(
  boards: PlacedRect[],
  sections: AreaSection[],
  name: string,
  before: PlacedRect[] = boards,
): { x: number; y: number } | null {
  const self = boards.find((board) => board.name === name)
  if (!self) return null
  const index = sectionIndex(sections)
  if (!index.known(self.section)) return null
  const id = self.section
  const others = boards.filter((board) => board.name !== name)
  const members = others.filter((board) => index.known(board.section) && index.chain(board.section).includes(id))
  if (members.length === 0) return null
  const base = hull(members)
  const rootOf = (board: PlacedRect): string | null => (index.known(board.section) ? (index.chain(board.section).at(-1) ?? null) : null)
  const root = index.chain(id).at(-1) ?? null
  const unfixable = (other: PlacedRect): boolean => {
    if (members.includes(other) || !index.known(other.section) || rootOf(other) !== root) return true
    const mine = index.chain(id)
    const theirs = index.chain(other.section)
    const common = mine.findIndex((candidate) => theirs.includes(candidate))
    const mineKey = common === -1 ? mine.at(-1) : mine[common - 1]
    const theirsAt = common === -1 ? theirs.length : theirs.indexOf(mine[common] as string)
    const theirKey = theirsAt > 0 ? theirs[theirsAt - 1] : null
    const was = before
      .filter((board) => board.name !== name)
      .map((board) => ({ ...board, section: boards.find((entry) => entry.name === board.name)?.section ?? board.section }))
    const wasOther = was.find((board) => board.name === other.name)
    const mineArea = mineKey === undefined ? null : drawnArea(index, sections, mineKey, was)
    const theirArea = theirKey === null ? (wasOther ?? null) : drawnArea(index, sections, theirKey as string, was)
    return mineArea !== null && theirArea !== null && close(mineArea, theirArea)
  }
  const spots = members.flatMap((member) => [
    { x: member.x + member.width + GAP, y: member.y },
    { x: member.x, y: member.y + member.height + GAP },
  ])
  const scored = spots
    .map((spot) => ({ ...self, ...spot }))
    .filter(
      (placed) =>
        !others.some(
          (other) =>
            (close(placed, other) && (members.includes(other) || rootOf(other) !== root)) ||
            (overlaps(drawnRect(placed), drawnRect(other)) && unfixable(other)),
        ),
    )
    .map((placed) => {
      const grown = hull([...members, placed])
      return {
        x: placed.x,
        y: placed.y,
        touches: touchCounts(index, sections, others, placed, id),
        growth: grown.width * grown.height - base.width * base.height,
      }
    })
    .sort((a, b) => byLevel(a.touches, b.touches) || a.growth - b.growth || a.y - b.y || a.x - b.x)
  if (scored[0]) return { x: scored[0].x, y: scored[0].y }
  return { x: base.x, y: base.y + base.height + GAP }
}

/** Whether the drawn rect of `board` overlaps another board or a section area the board does not sit in. */
const collides = (index: SectionIndex, sections: AreaSection[], others: PlacedRect[], board: PlacedRect): boolean => {
  const mine = drawnRect(board)
  if (others.some((other) => overlaps(mine, drawnRect(other)))) return true
  const own = index.known(board.section) ? index.chain(board.section) : []
  const list = [...others, board]
  return sections.some((entry) => {
    if (own.includes(entry.id)) return false
    const area = drawnArea(index, sections, entry.id, list)
    return area !== null && overlaps(mine, area)
  })
}

const AREA_KEYS = ['parent', 'x', 'y', 'width', 'height'] as const

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * The canvas that `next` becomes after the layout rules ran on what an agent wrote to disk. A board
 * is placed or pushed only when it collides: its drawn rect, title bar included, overlaps the drawn
 * rect of another board or the drawn area of a section it is not in. A board new on a page or moved
 * to another section that collides is placed inside its section, a new board without a section that
 * collides moves clear of the page units, and `placeAtEnd` covers boards without x and y for
 * callers that pass them. `resolveLayout` then pushes the neighbours of the placed boards and of
 * the new, moved or resized boards that still collide. A board written clear of every other board
 * pushes nothing. A section that is new or whose parent or stored area changed, and whose drawn
 * area overlaps another unit of its container, makes its boards count as edited. Returns `null`
 * when nothing moves. Neither input is mutated.
 */
export function syncFromDisk(previous: CanvasFile, next: CanvasFile): CanvasFile | null {
  let changedAny = false
  const pages = next.pages.map((page) => {
    const before = previous.pages.find((entry) => entry.id === page.id)
    const prior = new Map((before?.boards ?? []).map((board) => [board.name, board]))
    const sections = (page.sections ?? []) as SectionEntry[]
    const index = sectionIndex(sections)
    const work = new Map<string, PlacedRect & { section?: unknown }>()
    for (const board of page.boards) work.set(board.name, board as unknown as PlacedRect)
    const usable = (board: PlacedRect) => finite(board.width) && finite(board.height)
    const priorBoards = [...prior.values()].filter(
      (board) => usable(board as unknown as PlacedRect) && finite(board.x) && finite(board.y),
    ) as unknown as PlacedRect[]
    const positioned = (skip: string) =>
      [...work.values()].filter((board) => board.name !== skip && usable(board) && finite(board.x) && finite(board.y))
    const edited = new Set<string>()
    for (const entry of page.boards) {
      const board = work.get(entry.name) as PlacedRect
      if (!usable(board)) continue
      const old = prior.get(entry.name)
      const added = !old
      const moved = typeof board.section === 'string' && (added || old.section !== board.section)
      const unplaced = !finite(board.x) || !finite(board.y)
      const fresh = added || moved || GEOMETRY.some((key) => old[key] !== entry[key])
      let placedBySync = false
      if (moved) {
        const bad = unplaced || collides(index, sections, positioned(entry.name), board)
        const spot = bad ? placeInSection([...positioned(entry.name), board], sections, entry.name, priorBoards) : null
        if (spot) {
          work.set(entry.name, { ...board, ...spot })
          placedBySync = true
        }
      }
      if (added && !unplaced && !index.known(board.section)) {
        const units = buildUnits(index, sections, null, positioned(entry.name)).map(
          ({ name, x, y, width, height }) => ({ name, x, y, width, height }),
        )
        const mine = drawnRect(board)
        const to = units.some((unit) => overlaps(mine, unit))
          ? resolveCollisions([...units, board], units.map((unit) => unit.name), GAP).get(entry.name)
          : undefined
        if (to) {
          work.set(entry.name, { ...board, ...to })
          placedBySync = true
        }
      }
      const now = work.get(entry.name) as PlacedRect
      if (!finite(now.x) || !finite(now.y)) {
        const [spot] = placeAtEnd(positioned(entry.name), [now])
        work.set(entry.name, { ...now, ...spot })
        edited.add(entry.name)
      } else if (placedBySync) {
        edited.add(entry.name)
      } else if (fresh && collides(index, sections, positioned(entry.name), now)) {
        edited.add(entry.name)
      }
    }
    const priorSections = new Map(((before?.sections ?? []) as SectionEntry[]).map((entry) => [entry.id, entry]))
    const list = positioned('')
    const regrouped = new Set<string>()
    const areaEdited = new Set<string>()
    for (const entry of sections) {
      const old = priorSections.get(entry.id)
      const changed = !old || AREA_KEYS.some((key) => (old[key] ?? null) !== (entry[key] ?? null))
      if (changed) areaEdited.add(entry.id)
      if (!changed || !index.parentOf.has(entry.id)) continue
      const units = buildUnits(index, sections, index.parentOf.get(entry.id) ?? null, list)
      const mine = units.find((unit) => unit.name === `section:${entry.id}`)
      if (!mine || !units.some((unit) => unit !== mine && overlaps(mine, unit))) continue
      for (const board of list) {
        if (!index.known(board.section) || !index.chain(board.section).includes(entry.id)) continue
        edited.add(board.name)
      }
      regrouped.add(entry.id)
    }
    if (edited.size === 0) return page
    const laid = [...work.values()].filter((board) => usable(board) && finite(board.x) && finite(board.y))
    const moves = resolveMoves(
      laid,
      sections,
      edited,
      priorBoards,
      regrouped,
    )
    const finalBoards = laid.map((board) => ({ ...board, ...moves.get(board.name) }))
    const shifted = shiftAreas(sections, laid, finalBoards, areaEdited)
    const final = new Map(finalBoards.map((board) => [board.name, board]))
    let changed = shifted !== sections
    const boards = page.boards.map((entry) => {
      const to = final.get(entry.name)
      if (!to || (to.x === entry.x && to.y === entry.y)) return entry
      changed = true
      return { ...entry, x: to.x, y: to.y }
    })
    if (!changed) return page
    changedAny = true
    return shifted !== sections ? { ...page, sections: shifted, boards } : { ...page, boards }
  })
  return changedAny ? { ...next, pages } : null
}

/**
 * Returns a copy of `canvas` with `edit` applied to `page`: board geometry (rounded) and section
 * membership, and section upserts and removals. Sections are applied first, so a board can join a
 * section created by the same edit. Fails with 404 for an unknown page or board, and with 400 for a
 * non-finite number, a size under 240 x 160, or a section that does not exist. `canvas` is not mutated.
 *
 * This is what a person does on the canvas, so it moves exactly the boards the edit names and nothing
 * else: a frame dropped on top of another stays there. Auto layout is an explicit action, the page's
 * Arrange or `tidy`. An agent's write to `canvas.json` is the other path, `syncFromDisk`, which does
 * push the frames the write crowds.
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
  let sectionsTouched = edit.sections !== undefined
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

  const original = sections
  sections = shiftAreas(
    sections,
    target.boards as PlacedRect[],
    boards as PlacedRect[],
    new Set((edit.sections?.set ?? []).map((entry) => entry.id)),
  )
  if (sections !== original) sectionsTouched = true

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

export const MAX_PAGE_TITLE = 120

/**
 * Returns a copy of `canvas` with the page's title and icon edited. A `null` icon removes it. Fails
 * with 404 for an unknown page and 400 for an empty or long title or an icon `isIcon` rejects.
 */
export function editPage(
  canvas: CanvasFile,
  page: string,
  edit: { title?: unknown; icon?: unknown },
  isIcon: (name: string) => boolean,
): Placement {
  const target = canvas.pages.find((candidate) => candidate.id === page)
  if (!target) return { error: `no page named ${page}`, status: 404 }
  const next: CanvasPageEntry = { ...target }
  if (edit.title !== undefined) {
    if (typeof edit.title !== 'string' || edit.title.trim() === '') {
      return { error: 'title must be a non-empty string', status: 400 }
    }
    const title = edit.title.trim()
    if (title.length > MAX_PAGE_TITLE) {
      return { error: `title is at most ${MAX_PAGE_TITLE} characters`, status: 400 }
    }
    next.title = title
  }
  if (edit.icon === null) {
    delete next.icon
  } else if (edit.icon !== undefined) {
    if (typeof edit.icon !== 'string' || !isIcon(edit.icon)) {
      return { error: 'unknown icon', status: 400 }
    }
    next.icon = edit.icon
  }
  return {
    canvas: { ...canvas, pages: canvas.pages.map((entry) => (entry === target ? next : entry)) },
  }
}
