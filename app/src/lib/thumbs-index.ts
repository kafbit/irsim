import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { designDir } from './design-dir'
import { thumbFile, thumbsDir } from './thumbs-dir'

export type ThumbEntry = { key: string; at: number }
export type ThumbIndex = Record<string, ThumbEntry[]>

const MAX_ENTRIES = 8

/** One index per project, because the thumbnails directory is shared and board names repeat across projects. */
const indexPath = (dir: string): string =>
  join(dir, `index-${createHash('sha1').update(designDir()).digest('hex').slice(0, 12)}.json`)

/** The `${indexPath}\0${board}\0${key}` triples this process knows the index lists. */
const known = (): Set<string> => {
  const holder = globalThis as unknown as { __irsimThumbIndexKnown?: Set<string> }
  holder.__irsimThumbIndexKnown ??= new Set()
  return holder.__irsimThumbIndexKnown
}

const knownKey = (path: string, board: string, key: string): string => `${path}\0${board}\0${key}`

export const readThumbIndex = async (dir: string = thumbsDir()): Promise<ThumbIndex> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(indexPath(dir), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ThumbIndex) : {}
  } catch {
    return {}
  }
}

const fileExists = (dir: string, key: string): Promise<boolean> =>
  stat(join(dir, thumbFile(key))).then(
    () => true,
    () => false,
  )

let chain: Promise<unknown> = Promise.resolve()

const writeIndex = async (dir: string, index: ThumbIndex): Promise<void> => {
  await mkdir(dir, { recursive: true })
  const path = indexPath(dir)
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}`
  await writeFile(temporary, JSON.stringify(index))
  await rename(temporary, path)
}

/** Serializes read-modify-write cycles of the index in this process. */
export const updateThumbIndex = (
  change: (index: ThumbIndex, dir: string) => void | Promise<void>,
  dir: string = thumbsDir(),
): Promise<void> => {
  const next = chain.then(async () => {
    const index = await readThumbIndex(dir)
    await change(index, dir)
    await writeIndex(dir, index)
  })
  chain = next.catch(() => {})
  return next
}

/** Records `key` as the newest thumbnail of `board`. */
export const recordThumb = async (board: string, key: string, dir: string = thumbsDir()): Promise<void> => {
  const path = indexPath(dir)
  await updateThumbIndex((index) => {
    const rest = (index[board] ?? []).filter((entry) => entry.key !== key)
    const kept = [{ key, at: Date.now() }, ...rest]
    for (const dropped of kept.slice(MAX_ENTRIES)) known().delete(knownKey(path, board, dropped.key))
    index[board] = kept.slice(0, MAX_ENTRIES)
  }, dir)
  known().add(knownKey(path, board, key))
}

/** Records `key` only when the board's index does not list it. A key seen once in this process skips the disk read. */
export const recordThumbIfMissing = async (board: string, key: string): Promise<void> => {
  const dir = thumbsDir()
  const marker = knownKey(indexPath(dir), board, key)
  if (known().has(marker)) return
  if ((await readThumbIndex(dir))[board]?.some((entry) => entry.key === key)) {
    known().add(marker)
    return
  }
  await recordThumb(board, key, dir)
}

/** The newest indexed key of `board`, other than `current`, whose file still exists. */
export const newestOlderThumb = async (board: string, current: string): Promise<string | undefined> => {
  const dir = thumbsDir()
  for (const entry of (await readThumbIndex(dir))[board] ?? []) {
    if (entry.key === current) continue
    if (await fileExists(dir, entry.key)) return entry.key
  }
  return undefined
}

/** Drops index entries whose file is gone, and boards left with none. */
export const pruneThumbIndex = (): Promise<void> =>
  updateThumbIndex(async (index, dir) => {
    for (const [board, entries] of Object.entries(index)) {
      const kept: ThumbEntry[] = []
      for (const entry of entries) {
        if (await fileExists(dir, entry.key)) kept.push(entry)
        else known().delete(knownKey(indexPath(dir), board, entry.key))
      }
      if (kept.length > 0) index[board] = kept
      else delete index[board]
    }
  })
