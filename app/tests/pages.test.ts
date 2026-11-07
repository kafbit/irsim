import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGES, pageOf } from '../src/lib/pages'

const designDir = join(import.meta.dir, '../../../design')
const files = readdirSync(designDir)
  .filter((file) => file.endsWith('.dc.html'))
  .map((file) => file.slice(0, -'.dc.html'.length))

const previewOf = (name: string): { width: number; height: number } => {
  const source = readFileSync(join(designDir, `${name}.dc.html`), 'utf8')
  const match = /data-props=(?:'([^']*)'|"([^"]*)")/.exec(source)
  const raw = match?.[1] ?? match?.[2]
  if (!raw) return { width: 1440, height: 900 }
  const props = JSON.parse(
    raw
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  ) as {
    $preview?: { width: number; height: number }
  }
  return props.$preview ?? { width: 1440, height: 900 }
}

describe('PAGES', () => {
  it('has the pages of docs/14 that hold boards', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'sitemap',
      'general',
      'sales',
      'inventory',
      'admin',
      'settings',
      'public',
      'dialogs',
      'platform-customers',
      'platform-monitoring',
      'platform-system',
      'client',
      'components',
      'motion',
      'deprecated',
    ])
  })

  it('puts every design file on exactly one page', () => {
    const placed = PAGES.flatMap((page) => page.boards)
    expect(new Set(placed).size).toBe(placed.length)
    expect([...placed].sort()).toEqual([...files].sort())
    for (const name of files) expect(pageOf(name)).toBeDefined()
  })

  it('names no missing file', () => {
    for (const page of PAGES) {
      for (const board of page.boards) expect(files).toContain(board)
    }
  })

  it('pageOf returns undefined for an unknown board', () => {
    expect(pageOf('NoSuchBoard')).toBeUndefined()
  })
})

describe('design/canvas.json', () => {
  const canvas = JSON.parse(readFileSync(join(designDir, 'canvas.json'), 'utf8')) as {
    pages: { id: string; boards: { name: string; width: number; height: number }[] }[]
  }

  it('lists the same boards per page as PAGES', () => {
    expect(canvas.pages.map((page) => [page.id, page.boards.map((board) => board.name)])).toEqual(
      PAGES.map((page) => [page.id, page.boards]),
    )
  })

  it('sizes every board from its $preview, or 1440x900', () => {
    for (const page of canvas.pages) {
      for (const board of page.boards) {
        const { width, height } = previewOf(board.name)
        expect({ name: board.name, width: board.width, height: board.height }).toEqual({
          name: board.name,
          width,
          height,
        })
      }
    }
  })
})
