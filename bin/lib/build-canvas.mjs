import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GAP = 80
const ROW_WIDTH = 12000

/** Positions for `sizes` below every `existing` rect, left aligned, wrapping at `ROW_WIDTH`. Same rule as `placeAtEnd` in `app/src/lib/board-placement.mjs`, which the shipped app cannot import from here. */
const placeAtEnd = (existing, sizes) => {
  const left = existing.length > 0 ? Math.min(...existing.map((rect) => rect.x)) : 0
  let rowY = existing.length > 0 ? Math.max(...existing.map((rect) => rect.y + rect.height)) + GAP : 0
  let cursorX = left
  let rowHeight = 0
  return sizes.map((size) => {
    if (cursorX > left && cursorX - left + size.width > ROW_WIDTH) {
      rowY += rowHeight + GAP
      cursorX = left
      rowHeight = 0
    }
    const position = { x: Math.round(cursorX), y: Math.round(rowY) }
    cursorX += size.width + GAP
    rowHeight = Math.max(rowHeight, size.height)
    return position
  })
}

const DEFAULT_SIZE = { width: 1440, height: 900 }
const UNSORTED = { id: 'unsorted', title: 'Unsorted' }
const SUFFIX = '.dc.html'

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

export const readBoard = (source) => {
  const title = decode(/<title>([^<]*)<\/title>/.exec(source)?.[1] ?? '').trim()
  const attribute = /<script[^>]*type="text\/x-dc"[^>]*data-props=(?:'([^']*)'|"([^"]*)")/.exec(source)
  const raw = attribute?.[1] ?? attribute?.[2]
  const props = raw ? JSON.parse(decode(raw)) : {}
  return {
    title,
    width: props.$preview?.width ?? DEFAULT_SIZE.width,
    height: props.$preview?.height ?? DEFAULT_SIZE.height,
  }
}

export const boardsOnDisk = (designDir) =>
  readdirSync(designDir)
    .filter((file) => file.endsWith(SUFFIX))
    .map((file) => file.slice(0, -SUFFIX.length))

const readPrevious = (file) => {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`)
  }
}

const keptSections = (sections) =>
  Array.isArray(sections)
    ? sections
        .filter((entry) => typeof entry?.id === 'string' && typeof entry?.title === 'string')
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          ...(typeof entry.variantOf === 'string' ? { variantOf: entry.variantOf } : {}),
          ...(typeof entry.baseSection === 'string' ? { baseSection: entry.baseSection } : {}),
          ...(typeof entry.parent === 'string' ? { parent: entry.parent } : {}),
          ...(typeof entry.color === 'string' ? { color: entry.color } : {}),
          ...(['x', 'y', 'width', 'height'].every((key) => Number.isFinite(entry[key]))
            ? { x: entry.x, y: entry.y, width: entry.width, height: entry.height }
            : {}),
          ...(entry.layout && typeof entry.layout === 'object' ? { layout: entry.layout } : {}),
        }))
    : undefined

/** True when `canvas.json` is missing or a board file in `designDir` is not listed on any page. */
export const needsRegistration = (designDir) => {
  const file = join(designDir, 'canvas.json')
  if (!existsSync(file)) return true
  const previous = readPrevious(file)
  const assigned = new Set((previous.pages ?? []).flatMap((page) => page.boards.map((b) => b.name)))
  return boardsOnDisk(designDir).some((name) => !assigned.has(name))
}

/**
 * Writes `<designDir>/canvas.json`. Keeps existing pages, positions, overrides and bindings, adds
 * unlisted boards to the `unsorted` page in a grid, and drops boards whose file is gone.
 * Throws when the design folder is unreadable or an existing `canvas.json` is not valid JSON.
 */
export const buildCanvas = (designDir) => {
  const file = join(designDir, 'canvas.json')
  const previous = readPrevious(file)
  const earlier = new Map(
    (previous.pages ?? []).flatMap((page) => page.boards.map((board) => [board.name, board])),
  )
  const known = new Set(boardsOnDisk(designDir))
  const assigned = new Set((previous.pages ?? []).flatMap((page) => page.boards.map((b) => b.name)))
  const loose = [...known].filter((name) => !assigned.has(name)).sort()
  const layout = (previous.pages ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    ...(typeof page.icon === 'string' ? { icon: page.icon } : {}),
    sections: keptSections(page.sections),
    boards: page.boards.map((b) => b.name),
  }))
  if (loose.length > 0) {
    const existing = layout.find((page) => page.id === UNSORTED.id)
    if (existing) existing.boards.push(...loose)
    else layout.push({ ...UNSORTED, boards: loose })
  }

  const pages = layout.map((page) => {
    const sized = page.boards
      .filter((name) => known.has(name))
      .map((name) => ({ name, ...readBoard(readFileSync(join(designDir, `${name}${SUFFIX}`), 'utf8')) }))
    const sectionIds = new Set((page.sections ?? []).map((entry) => entry.id))
    const boards = []
    const placedOf = (board) => {
      const kept = earlier.get(board.name)
      return Number.isFinite(kept?.x) && Number.isFinite(kept?.y) ? kept : null
    }
    const keptRects = sized
      .filter((board) => placedOf(board))
      .map((board) => ({ ...board, x: placedOf(board).x, y: placedOf(board).y }))
    const fresh = sized.filter((board) => !placedOf(board))
    const spots = new Map(
      placeAtEnd(keptRects, fresh).map((spot, index) => [fresh[index].name, spot]),
    )
    for (const board of sized) {
      const kept = earlier.get(board.name)
      const spot = spots.get(board.name)
      boards.push({
        name: board.name,
        title: board.title,
        x: spot ? spot.x : kept.x,
        y: spot ? spot.y : kept.y,
        width: board.width,
        height: board.height,
        ...(typeof kept?.interactive === 'boolean' ? { interactive: kept.interactive } : {}),
        ...(typeof kept?.expand === 'string' ? { expand: kept.expand } : {}),
        ...(typeof kept?.section === 'string' && sectionIds.has(kept.section)
          ? { section: kept.section }
          : {}),
        ...(typeof kept?.variantOf === 'string' ? { variantOf: kept.variantOf } : {}),
        ...(typeof kept?.variantLabel === 'string' ? { variantLabel: kept.variantLabel } : {}),
        ...(typeof kept?.baseHash === 'string' ? { baseHash: kept.baseHash } : {}),
      })
    }
    return {
      id: page.id,
      title: page.title,
      ...(page.icon ? { icon: page.icon } : {}),
      ...(page.sections ? { sections: page.sections } : {}),
      boards,
    }
  })

  const canvas = {
    version: 1,
    pages,
    overrides: previous.overrides ?? { colors: {}, radius: {}, type: {} },
    bindings: previous.bindings ?? {},
  }
  writeFileSync(file, `${JSON.stringify(canvas, null, 2)}\n`)
  const boards = pages.reduce((sum, page) => sum + page.boards.length, 0)
  return { file, pages: pages.length, boards }
}
