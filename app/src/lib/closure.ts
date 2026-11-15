import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { designDir } from './design-dir'

/**
 * `hash` follows file stamps (mtime and size), cheap for caching. `content` follows the sources
 * only, so a touch, a checkout or a save with no change leaves it as it was. `render` is `content`
 * without the root board's name, so a byte-identical copy under another name shares a thumbnail.
 */
export type Closure = {
  boards: Record<string, string>
  missing: string[]
  hash: string
  content: string
  render: string
}

type Entry = { closure: Closure; stamps: Map<string, string> }

const IMPORT = /<dc-import\s+name=(?:"([^"]*)"|'([^']*)')/g

const cache = new Map<string, Entry>()

/** The `name` of every `<dc-import>` in a board source, unique, in order of first use. */
export const importsOf = (source: string): string[] => {
  const names = new Set<string>()
  for (const match of source.matchAll(IMPORT)) {
    const name = match[1] ?? match[2]
    if (name) names.add(name)
  }
  return [...names]
}

const stampOf = async (dir: string, name: string): Promise<string> => {
  try {
    const info = await stat(join(dir, `${name}.dc.html`))
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return 'missing'
  }
}

const unchanged = async (dir: string, entry: Entry): Promise<boolean> => {
  const current = await Promise.all(
    [...entry.stamps.keys()].map(async (name) => [name, await stampOf(dir, name)] as const),
  )
  return current.every(([name, stamp]) => entry.stamps.get(name) === stamp)
}

const build = async (dir: string, board: string): Promise<Entry> => {
  const boards: Record<string, string> = {}
  const stamps = new Map<string, string>()
  const missing: string[] = []
  const queue = [board]
  while (queue.length > 0) {
    const name = queue.shift() as string
    if (stamps.has(name)) continue
    const stamp = await stampOf(dir, name)
    stamps.set(name, stamp)
    if (stamp === 'missing') {
      missing.push(name)
      continue
    }
    const source = await readFile(join(dir, `${name}.dc.html`), 'utf8')
    boards[name] = source
    queue.push(...importsOf(source))
  }
  const hash = createHash('sha1')
    .update(
      [...stamps]
        .filter(([, stamp]) => stamp !== 'missing')
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, stamp]) => `${name}:${stamp}`)
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 12)
  const content = createHash('sha1')
    .update(
      Object.keys(boards)
        .sort()
        .map((name) => `${name}\n${boards[name]}`)
        .join('\n\0'),
    )
    .digest('hex')
    .slice(0, 12)
  const render = createHash('sha1')
    .update(
      [
        boards[board] ?? '',
        ...Object.keys(boards)
          .filter((name) => name !== board)
          .sort()
          .map((name) => `${name}\n${boards[name]}`),
      ].join('\n\0'),
    )
    .digest('hex')
    .slice(0, 12)
  return { closure: { boards, missing, hash, content, render }, stamps }
}

/**
 * The board and every board it imports, read from `design/`. A missing import is listed in
 * `missing`, not thrown. Each call stats the closure files; it reads them again only when one changed.
 */
export const closureOf = async (board: string): Promise<Closure> => {
  const dir = designDir()
  const key = `${dir}\n${board}`
  const cached = cache.get(key)
  if (cached && (await unchanged(dir, cached))) return cached.closure
  const entry = await build(dir, board)
  cache.set(key, entry)
  return entry.closure
}
