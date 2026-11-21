import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BOARD_SUFFIX = '.html'
export const LEGACY_SUFFIX = '.dc.html'

const NAME = /^[A-Za-z][A-Za-z0-9]*$/
const MARKER = /<x-dc[\s>]|type=["']text\/x-dc["']/

/** `Leads.html`, `Leads.dc.html` and `Leads` all name the board `Leads`. */
export const boardNameOf = (value) => value.replace(/\.dc\.html$/, '').replace(/\.html$/, '')

/** True for the source of a board: it holds the `<x-dc>` root or the `text/x-dc` script. */
export const isBoardSource = (source) => MARKER.test(source)

const readable = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * The file name of the board `name` in `dir`: `<name>.html` when that file exists and its source is
 * a board, else the legacy `<name>.dc.html`, else `null`. A `<name>.html` that is not a board does
 * not hide a legacy file, and is the answer only when there is no legacy file.
 */
export const boardFileName = (dir, name) => {
  if (!NAME.test(name)) return null
  const current = `${name}${BOARD_SUFFIX}`
  const legacy = `${name}${LEGACY_SUFFIX}`
  const source = readable(join(dir, current))
  if (source !== null && isBoardSource(source)) return current
  if (existsSync(join(dir, legacy))) return legacy
  return source !== null ? current : null
}

/**
 * The boards in `dir`, sorted by name: every `<Name>.dc.html`, and every `<Name>.html` whose source
 * holds the board marker. `legacy` is true for a `.dc.html` file. A name in both forms is listed
 * once, as the `.html` file.
 */
export const listBoards = (dir) => {
  if (!existsSync(dir)) return []
  const found = new Map()
  for (const file of readdirSync(dir)) {
    if (file.endsWith(LEGACY_SUFFIX)) {
      const name = file.slice(0, -LEGACY_SUFFIX.length)
      if (NAME.test(name) && !found.has(name)) found.set(name, { name, file, legacy: true })
    } else if (file.endsWith(BOARD_SUFFIX)) {
      const name = file.slice(0, -BOARD_SUFFIX.length)
      if (!NAME.test(name)) continue
      const source = readable(join(dir, file))
      if (source !== null && isBoardSource(source)) found.set(name, { name, file, legacy: false })
    }
  }
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
