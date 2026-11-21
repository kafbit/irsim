import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { boardFileName } from './board-file.mjs'
import { placeAtEnd } from './board-placement.mjs'
import { designDir } from './design-dir'
import { readBoardMeta } from './lint-design.mjs'

export type CanvasBoard = {
  name: string
  title: string
  x: number
  y: number
  width: number
  height: number
  /** Set by hand to override the guess from the board source. */
  interactive?: boolean
  /** `"fill"`: a web page, which fills the window in full screen play. */
  expand?: string
  /** The id of a section of the same page. */
  section?: string
  /** The base board this board is a variant of. */
  variantOf?: string
  variantLabel?: string
  /** The render hash of the base when the variant was copied. */
  baseHash?: string
}
export type CanvasSection = {
  id: string
  title: string
  variantOf?: string
  baseSection?: string
  parent?: string
  color?: 'gray' | 'blue' | 'green' | 'amber' | 'purple' | 'red'
  /** A stored area; a section without one fits its boards. */
  x?: number
  y?: number
  width?: number
  height?: number
  layout?: { mode: 'wrap'; gap: number }
}
export type CanvasPage = {
  id: string
  title: string
  icon?: string
  sections?: CanvasSection[]
  boards: CanvasBoard[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const metaOf = async (dir: string, file: string): Promise<{ title: string; width: number; height: number } | null> => {
  try {
    return readBoardMeta(await readFile(join(dir, file), 'utf8'))
  } catch {
    return null
  }
}

const normalizeSection = (raw: unknown): CanvasSection | null => {
  if (!isObject(raw) || typeof raw.id !== 'string') return null
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title : raw.id
  return { ...(raw as CanvasSection), title }
}

const normalizePage = async (dir: string, raw: unknown): Promise<CanvasPage | null> => {
  if (!isObject(raw)) return null
  const rawBoards = Array.isArray(raw.boards) ? raw.boards : []
  const resolved: { board: Record<string, unknown>; name: string; meta: Awaited<ReturnType<typeof metaOf>> }[] = []
  for (const entry of rawBoards) {
    if (!isObject(entry) || typeof entry.name !== 'string') continue
    const file = boardFileName(dir, entry.name)
    if (file === null) continue
    const complete =
      typeof entry.title === 'string' &&
      entry.title.trim() !== '' &&
      isNumber(entry.width) &&
      isNumber(entry.height) &&
      isNumber(entry.x) &&
      isNumber(entry.y)
    resolved.push({ board: entry, name: entry.name, meta: complete ? null : await metaOf(dir, file) })
  }
  const sized = resolved.map(({ board, name, meta }) => {
    const title =
      typeof board.title === 'string' && board.title.trim() !== '' ? board.title : meta?.title || name
    const width = isNumber(board.width) ? board.width : meta?.width ?? 1440
    const height = isNumber(board.height) ? board.height : meta?.height ?? 900
    return { ...board, name, title, width, height } as CanvasBoard & { x?: number; y?: number }
  })
  const placed = (board: { x?: unknown; y?: unknown }) => isNumber(board.x) && isNumber(board.y)
  const kept = sized.filter(placed) as CanvasBoard[]
  const fresh = sized.filter((board) => !placed(board))
  const spots = placeAtEnd(kept, fresh)
  const boards = sized.map((board) => {
    if (placed(board)) return board as CanvasBoard
    const spot = spots[fresh.indexOf(board)]
    return { ...board, x: spot?.x ?? 0, y: spot?.y ?? 0 } as CanvasBoard
  })
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map(normalizeSection).filter((section): section is CanvasSection => section !== null)
    : []
  return { ...(raw as CanvasPage), ...(raw.sections === undefined ? {} : { sections }), boards }
}

/**
 * The pages of `canvas.json`, or `[]` when the file does not exist yet. The file on disk stays as
 * written: boards without a file are dropped, and a missing title, size or position is filled from
 * the board source so a hand written file does not break the canvas.
 */
export const readCanvasPages = async (): Promise<CanvasPage[]> => {
  const dir = designDir()
  const file = join(dir, 'canvas.json')
  if (!existsSync(file)) return []
  const canvas = JSON.parse(await readFile(file, 'utf8')) as { pages?: unknown }
  if (!Array.isArray(canvas?.pages)) return []
  const pages: CanvasPage[] = []
  for (const raw of canvas.pages) {
    const page = await normalizePage(dir, raw)
    if (page) pages.push(page)
  }
  return pages
}

const lucideNames = new Set<string>(Object.keys(dynamicIconImports))

export const isLucideIcon = (name: string): boolean => lucideNames.has(name)
