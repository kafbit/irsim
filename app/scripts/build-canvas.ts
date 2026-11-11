import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { designDir as resolveDesignDir } from '../src/lib/design-dir'

type Placed = { name: string; title: string; x: number; y: number; width: number; height: number }
type CanvasPage = { id: string; title: string; boards: Placed[] }
type Canvas = {
  version: 1
  pages: CanvasPage[]
  overrides: {
    colors: Record<string, string>
    radius: Record<string, string>
    type: Record<string, string>
  }
  bindings: Record<string, string>
}

const ROW_WIDTH = 12000
const GAP = 80
const DEFAULT_SIZE = { width: 1440, height: 900 }

const designDir = resolveDesignDir()
const canvasFile = join(designDir, 'canvas.json')

const decode = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const readBoard = (source: string): { title: string; width: number; height: number } => {
  const title = decode(/<title>([^<]*)<\/title>/.exec(source)?.[1] ?? '').trim()
  const attribute = /<script[^>]*type="text\/x-dc"[^>]*data-props=(?:'([^']*)'|"([^"]*)")/.exec(
    source,
  )
  const raw = attribute?.[1] ?? attribute?.[2]
  const props = raw
    ? (JSON.parse(decode(raw)) as { $preview?: { width?: number; height?: number } })
    : {}
  return {
    title,
    width: props.$preview?.width ?? DEFAULT_SIZE.width,
    height: props.$preview?.height ?? DEFAULT_SIZE.height,
  }
}

const previous: Partial<Canvas> = existsSync(canvasFile)
  ? (JSON.parse(readFileSync(canvasFile, 'utf8')) as Partial<Canvas>)
  : {}
const earlier = new Map<string, Placed>(
  (previous.pages ?? []).flatMap((page) =>
    page.boards.map((board) => [board.name, board] as const),
  ),
)

const known = new Set(
  readdirSync(designDir)
    .filter((f) => f.endsWith('.dc.html'))
    .map((f) => f.slice(0, -8)),
)

const UNSORTED = { id: 'unsorted', title: 'Unsorted' }

const assigned = new Set((previous.pages ?? []).flatMap((page) => page.boards.map((b) => b.name)))
const loose = [...known].filter((name) => !assigned.has(name)).sort()
const layout: { id: string; title: string; boards: string[] }[] = [
  ...(previous.pages ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    boards: page.boards.map((b) => b.name),
  })),
]
if (loose.length > 0) {
  const existing = layout.find((page) => page.id === UNSORTED.id)
  if (existing) existing.boards.push(...loose)
  else layout.push({ ...UNSORTED, boards: loose })
}

const pages: CanvasPage[] = layout.map((page) => {
  const sized = page.boards
    .filter((name) => known.has(name))
    .map((name) => ({
      name,
      ...readBoard(readFileSync(join(designDir, `${name}.dc.html`), 'utf8')),
    }))
  const boards: Placed[] = []
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
    const placed: Placed = {
      name: board.name,
      title: board.title,
      x: kept?.x ?? cursorX,
      y: kept?.y ?? rowY,
      width: board.width,
      height: board.height,
    }
    boards.push(placed)
    cursorX += board.width + GAP
    rowHeight = Math.max(rowHeight, board.height)
  }
  return { id: page.id, title: page.title, boards }
})

const canvas: Canvas = {
  version: 1,
  pages,
  overrides: previous.overrides ?? { colors: {}, radius: {}, type: {} },
  bindings: previous.bindings ?? {},
}

writeFileSync(canvasFile, `${JSON.stringify(canvas, null, 2)}\n`)
const total = pages.reduce((sum, page) => sum + page.boards.length, 0)
console.log(`wrote ${canvasFile}: ${pages.length} pages, ${total} boards`)
