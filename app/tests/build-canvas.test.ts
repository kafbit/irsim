import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const LAUNCHER = resolve(__dirname, '../../bin/irsim')

type Canvas = {
  pages: { id: string; title: string; boards: { name: string; title: string; x: number; y: number; width: number; height: number }[] }[]
  overrides: unknown
  bindings: unknown
}

let dir = ''

const board = (title: string, size?: { width: number; height: number }) =>
  `<html><head><title>${title}</title></head><body>` +
  `<script type="text/x-dc" data-props='${JSON.stringify(size ? { $preview: size } : {})}'></script>` +
  `</body></html>`

const add = (name: string, title: string, size?: { width: number; height: number }) =>
  writeFileSync(join(dir, `${name}.dc.html`), board(title, size))

const run = () =>
  execFileSync('node', [LAUNCHER, 'build', '--design-dir', dir], { encoding: 'utf8' })

const canvas = (): Canvas => JSON.parse(readFileSync(join(dir, 'canvas.json'), 'utf8')) as Canvas

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-build-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('irsim build', () => {
  it('puts a new board on the unsorted page with its title and preview size', () => {
    add('Leads', 'Leads screen', { width: 800, height: 600 })
    add('Home', 'Home')
    const output = run()
    expect(output).toBe(`wrote ${join(dir, 'canvas.json')}: 1 pages, 2 boards\n`)
    const [page] = canvas().pages
    expect(page?.id).toBe('unsorted')
    expect(page?.title).toBe('Unsorted')
    expect(page?.boards).toEqual([
      { name: 'Home', title: 'Home', x: 0, y: 0, width: 1440, height: 900 },
      { name: 'Leads', title: 'Leads screen', x: 1520, y: 0, width: 800, height: 600 },
    ])
  })

  it('wraps to a new row at 12000 wide', () => {
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) add(name, name)
    run()
    const boards = canvas().pages[0]?.boards ?? []
    expect(boards.find((b) => b.name === 'H')).toMatchObject({ x: 0, y: 980 })
    expect(boards.find((b) => b.name === 'G')).toMatchObject({ x: 9120, y: 0 })
  })

  it('keeps existing pages, positions, overrides and bindings and adds the new board to unsorted', () => {
    add('Leads', 'Leads')
    writeFileSync(
      join(dir, 'canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: 'sales',
            title: 'Sales',
            boards: [{ name: 'Leads', title: 'Old', x: 500, y: 700, width: 1, height: 1 }],
          },
        ],
        overrides: { colors: { a: 'b' }, radius: {}, type: {} },
        bindings: { x: 'y' },
      }),
    )
    add('Pipeline', 'Pipeline')
    run()
    const result = canvas()
    expect(result.pages.map((p) => p.id)).toEqual(['sales', 'unsorted'])
    expect(result.pages[0]?.boards[0]).toEqual({
      name: 'Leads',
      title: 'Leads',
      x: 500,
      y: 700,
      width: 1440,
      height: 900,
    })
    expect(result.pages[1]?.boards.map((b) => b.name)).toEqual(['Pipeline'])
    expect(result.overrides).toEqual({ colors: { a: 'b' }, radius: {}, type: {} })
    expect(result.bindings).toEqual({ x: 'y' })
  })

  it('drops a board whose file is gone', () => {
    add('Leads', 'Leads')
    add('Pipeline', 'Pipeline')
    run()
    unlinkSync(join(dir, 'Pipeline.dc.html'))
    const output = run()
    expect(output).toContain('1 pages, 1 boards')
    expect(canvas().pages[0]?.boards.map((b) => b.name)).toEqual(['Leads'])
  })

  it('writes the same file on a second run', () => {
    add('Leads', 'Leads')
    add('Pipeline', 'Pipeline', { width: 2000, height: 1000 })
    run()
    const first = readFileSync(join(dir, 'canvas.json'), 'utf8')
    run()
    expect(readFileSync(join(dir, 'canvas.json'), 'utf8')).toBe(first)
  })

  it('keeps sections and variant fields, and drops a section id that names no section', () => {
    add('Leads', 'Leads')
    add('LeadsVariantBetter', 'Leads')
    writeFileSync(
      join(dir, 'canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: 'sales',
            title: 'Sales',
            sections: [{ id: 'v', title: 'Leads variants', variantOf: 'Leads' }],
            boards: [
              { name: 'Leads', title: 'Leads', x: 0, y: 0, width: 1, height: 1, section: 'v' },
              {
                name: 'LeadsVariantBetter',
                title: 'Leads',
                x: 5,
                y: 6,
                width: 1,
                height: 1,
                section: 'gone',
                variantOf: 'Leads',
                variantLabel: 'Better',
                baseHash: 'abc',
              },
            ],
          },
        ],
        overrides: { colors: {}, radius: {}, type: {} },
        bindings: {},
      }),
    )
    run()
    const [page] = canvas().pages as unknown as {
      sections: unknown
      boards: Record<string, unknown>[]
    }[]
    expect(page?.sections).toEqual([{ id: 'v', title: 'Leads variants', variantOf: 'Leads' }])
    expect(page?.boards[0]).toMatchObject({ name: 'Leads', section: 'v' })
    const variant = page?.boards[1]
    expect(variant).toMatchObject({ variantOf: 'Leads', variantLabel: 'Better', baseHash: 'abc' })
    expect(variant).not.toHaveProperty('section')
  })

  it('keeps baseSection on a variant section', () => {
    add('Leads', 'Leads')
    writeFileSync(
      join(dir, 'canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: 'sales',
            title: 'Sales',
            sections: [
              { id: 'main', title: 'Main' },
              { id: 'v', title: 'Leads variants', variantOf: 'Leads', baseSection: 'main' },
            ],
            boards: [{ name: 'Leads', title: 'Leads', x: 0, y: 0, width: 1, height: 1, section: 'v' }],
          },
        ],
        overrides: { colors: {}, radius: {}, type: {} },
        bindings: {},
      }),
    )
    run()
    const [page] = canvas().pages as unknown as { sections: unknown }[]
    expect(page?.sections).toEqual([
      { id: 'main', title: 'Main' },
      { id: 'v', title: 'Leads variants', variantOf: 'Leads', baseSection: 'main' },
    ])
  })
})
