import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { designDir } from './design-dir'

export type Shared = { css: string; modules: string[]; stamp: string; content: string }

type Listed = { path: string; stamp: string }

const digest = (text: string | Buffer[]): string => {
  const hash = createHash('sha1')
  if (typeof text === 'string') hash.update(text)
  else for (const part of text) hash.update(part)
  return hash.digest('hex').slice(0, 12)
}

export const sharedDir = (): string => join(designDir(), 'shared')

const list = async (root: string, prefix = ''): Promise<Listed[]> => {
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return []
  }
  const found: Listed[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...(await list(root, path)))
    else if (entry.isFile()) {
      try {
        const info = await stat(join(root, path))
        found.push({ path, stamp: `${path}:${info.mtimeMs}:${info.size}` })
      } catch {}
    }
  }
  return found
}

const cache = new Map<string, Shared>()

/** The files of `design/shared/`: their CSS, their script modules and two change markers. */
export const readShared = async (): Promise<Shared> => {
  const root = sharedDir()
  const files = (await list(root)).sort((a, b) => (a.path < b.path ? -1 : 1))
  const stamp = files.length === 0 ? 'none' : digest(files.map((file) => file.stamp).join('\n'))
  const cached = cache.get(root)
  if (cached && cached.stamp === stamp) return cached
  const parts: Buffer[] = []
  let css = ''
  const modules: string[] = []
  for (const { path } of files) {
    let bytes: Buffer
    try {
      bytes = await readFile(join(root, path))
    } catch {
      continue
    }
    parts.push(Buffer.from(`${path}\0`), bytes)
    if (path.endsWith('.css')) css += `/* ${path} */\n${bytes.toString('utf8')}\n`
    else if (path.endsWith('.js') || path.endsWith('.mjs')) modules.push(path)
  }
  const shared = { css, modules, stamp, content: digest(parts) }
  cache.set(root, shared)
  return shared
}
