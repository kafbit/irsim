import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROW_WIDTH = 12000
const GAP = 80
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
    const boards = []
    let cursorX = 0
    let rowY = 0
    let rowHeight = 0
    for (const board of sized) {
      const kept = earlier.get(board.name)
      if (cursorX > 0 && cursorX + board.width > ROW_WIDTH) {
        rowY += rowHeight + GAP
        cursorX = 0
        rowHeight = 0
      }
      boards.push({
        name: board.name,
        title: board.title,
        x: kept?.x ?? cursorX,
        y: kept?.y ?? rowY,
        width: board.width,
        height: board.height,
        ...(typeof kept?.interactive === 'boolean' ? { interactive: kept.interactive } : {}),
        ...(typeof kept?.expand === 'string' ? { expand: kept.expand } : {}),
      })
      cursorX += board.width + GAP
      rowHeight = Math.max(rowHeight, board.height)
    }
    return { id: page.id, title: page.title, boards }
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
