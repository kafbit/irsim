import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findOverlaps, type PlacementRect } from '../src/lib/board-placement.mjs'
import { lintDesign, readBoardMeta } from '../src/lib/lint-design.mjs'

let base = ''
let dir = ''
// Boards default to their own spot on x so a test that does not care about placement does not
// report a gap problem it did not ask for. Position tests pass x and y.
let slot = 0

const html = (title: string, preview: unknown = { width: 800, height: 600 }, extra = '') =>
  `<html lang="en" dir="ltr"><head><title>${title}</title></head><body><x-dc>${extra}</x-dc>` +
  `<script type="text/x-dc" data-props='${JSON.stringify(preview === null ? {} : { $preview: preview })}'></script></body></html>`

const board = (name: string, source = html(name)) => writeFileSync(join(dir, `${name}.html`), source)
const EMPTY = { overrides: { colors: {}, radius: {}, type: {} }, bindings: {} }
const canvas = (value: unknown) =>
  writeFileSync(join(dir, 'canvas.json'), typeof value === 'string' ? value : JSON.stringify({ ...EMPTY, ...(value as object) }))
const entry = (name: string, extra: object = {}) => ({
  name,
  title: name,
  x: slot++ * 900,
  y: 0,
  width: 800,
  height: 600,
  ...extra,
})
const at = (name: string, x: number, y: number, extra: object = {}) =>
  entry(name, { x, y, ...extra })
const page = (boards: object[], extra: object = {}) => ({ id: 'p', title: 'P', boards, ...extra })
const rules = (result = lintDesign(dir)) => result.problems.map((p) => p.rule)

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'irsim-lint-'))
  dir = join(base, 'design')
  mkdirSync(dir)
  slot = 0
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('lintDesign canvas.json', () => {
  it('passes a clean folder', () => {
    board('A')
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(lintDesign(dir)).toEqual({ ok: true, problems: [] })
  })

  it('warns when canvas.json is missing and boards exist', () => {
    board('A')
    const result = lintDesign(dir)
    expect(result.ok).toBe(true)
    expect(rules(result)).toContain('canvas-json-missing')
  })

  it('reports invalid JSON as an error', () => {
    canvas('{ nope')
    const result = lintDesign(dir)
    expect(result.ok).toBe(false)
    expect(rules(result)).toEqual(['canvas-json-invalid'])
  })

  it('checks version, page id, title and icon', () => {
    board('A')
    canvas({ version: 2, pages: [page([entry('A')], { title: '', icon: 'Not Kebab' }), page([], { title: 'Q' })] })
    expect(rules()).toEqual(expect.arrayContaining(['canvas-version', 'page-title', 'page-icon', 'page-id-duplicate']))
  })

  it('checks board name, file, duplicate, title and rect', () => {
    board('A')
    canvas({
      version: 1,
      pages: [
        page([entry('A'), entry('A'), entry('Gone'), entry('1bad'), entry('A', { width: 100, height: 10, x: 'z' })]),
        { id: 'q', title: 'Q', boards: [{ name: 'A', x: 1, y: 2 }] },
      ],
    })
    expect(new Set(rules())).toEqual(
      new Set(['board-name', 'board-file-missing', 'board-duplicate', 'board-rect', 'board-title']),
    )
  })

  it('warns about a board file no page lists', () => {
    board('A')
    board('B')
    canvas({ version: 1, pages: [page([entry('A')])] })
    const result = lintDesign(dir)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({ rule: 'board-unlisted', severity: 'warning', file: 'B.html' })
  })

  it('checks sections', () => {
    board('A')
    canvas({
      version: 1,
      pages: [
        page([entry('A', { section: 'nope' })], {
          sections: [
            { id: 's1', title: 'One', color: 'pink', x: 1 },
            { id: 's1', title: '' },
            { id: 's2', title: 'Two', parent: 'ghost' },
            { id: 'c1', title: 'C1', parent: 'c2' },
            { id: 'c2', title: 'C2', parent: 'c1' },
            { id: 'd1', title: 'D1' },
            { id: 'd2', title: 'D2', parent: 'd1' },
            { id: 'd3', title: 'D3', parent: 'd2' },
            { id: 'd4', title: 'D4', parent: 'd3' },
          ],
        }),
      ],
    })
    expect(new Set(rules())).toEqual(
      new Set([
        'section-missing',
        'section-color',
        'section-area',
        'section-id-duplicate',
        'section-title',
        'section-parent-missing',
        'section-cycle',
        'section-depth',
      ]),
    )
  })

  it('warns, and does not fail, for a board smaller than the resize minimum', () => {
    board('A')
    canvas({ version: 1, pages: [page([entry('A', { width: 100, height: 100 })])] })
    const result = lintDesign(dir)
    const rects = result.problems.filter((p) => p.rule === 'board-rect')
    expect(rects.map((p) => p.severity)).toEqual(['warning', 'warning'])
    expect(result.ok).toBe(true)
  })

  it('reproduces the hand written incident: boards with only name, x, y', () => {
    board('A')
    board('B')
    canvas({ version: 1, pages: [{ id: 'p', title: 'P', boards: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 900, y: 0 }] }] })
    const result = lintDesign(dir)
    expect(result.ok).toBe(false)
    const found = result.problems.map((p) => `${p.rule}:${p.path}`)
    expect(found).toContain('board-title:pages[0].boards[0].title')
    expect(found).toContain('board-rect:pages[0].boards[1].width')
    expect(found).toContain('board-rect:pages[0].boards[1].height')
  })

  it('sorts problems by file then path', () => {
    board('A', '<html><x-dc></x-dc></html>')
    canvas({ version: 1, pages: [page([entry('A', { width: 1, height: 1 })])] })
    const keys = lintDesign(dir).problems.map((p) => `${p.file}|${p.path}`)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('lintDesign frame overlaps', () => {
  // Two boards of one page, the second at `spot`, both 800x600.
  const pair = (spot: { x: number; y: number }) => {
    board('A')
    board('B')
    canvas({ version: 1, pages: [page([at('A', 0, 0), at('B', spot.x, spot.y)])] })
    return lintDesign(dir).problems.filter((p) => p.rule === 'board-overlap')
  }

  it.each([
    ['edge to edge on x', { x: 800, y: 0 }, 0],
    ['1 px into each other on x', { x: 799, y: 0 }, 1],
    ['80 px clear on x', { x: 880, y: 0 }, 0],
    ['the same spot', { x: 0, y: 0 }, 1],
    ['edge to edge below', { x: 0, y: 600 }, 0],
    ['1 px into each other below', { x: 0, y: 599 }, 1],
    ['overlapping on x and clear on y', { x: 100, y: 700 }, 0],
    ['clear on x and overlapping on y', { x: 900, y: 100 }, 0],
    ['corner to corner at negative positions', { x: -800, y: -600 }, 0],
    ['1 px into each other at negative positions', { x: -799, y: -599 }, 1],
  ])('reports the pair %s as %i overlap problems', (_case, spot, expected) => {
    expect(pair(spot)).toHaveLength(expected)
  })

  it('reports every pair of a stacked page once, at the later board', () => {
    board('A')
    board('B')
    board('C')
    canvas({
      version: 1,
      pages: [page([at('A', 0, 0), at('B', 10, 0), at('C', 20, 0)])],
    })
    const found = lintDesign(dir).problems.filter((p) => p.rule === 'board-overlap')
    expect(found.map((p) => p.path)).toEqual([
      'pages[0].boards[1]',
      'pages[0].boards[2]',
      'pages[0].boards[2]',
    ])
    expect(found[0]).toMatchObject({
      severity: 'error',
      message: expect.stringContaining('boards A and B cover'),
      fix: expect.stringContaining('Arrange'),
    })
  })

  it('leaves a board whose rect is not four positive numbers to board-rect', () => {
    board('A')
    board('B')
    canvas({ version: 1, pages: [page([at('A', 0, 0), at('B', 0, 0, { width: 0, height: 'tall' })])] })
    const found = lintDesign(dir).problems
    expect(found.filter((p) => p.rule === 'board-overlap')).toEqual([])
    // Sorted by path, so height lands before width.
    expect(found.filter((p) => p.rule === 'board-rect').map((p) => p.path)).toEqual([
      'pages[0].boards[1].height',
      'pages[0].boards[1].width',
    ])
  })

  it('does not compare boards of different pages', () => {
    board('A')
    board('B')
    canvas({
      version: 1,
      pages: [page([at('A', 0, 0)]), { id: 'q', title: 'Q', boards: [at('B', 0, 0)] }],
    })
    expect(rules().filter((rule) => rule === 'board-overlap')).toEqual([])
  })

  it('flags the pairs the canvas itself treats as covering each other', () => {
    const rects: PlacementRect[] = [
      { name: 'A', x: 0, y: 0, width: 800, height: 600 },
      { name: 'B', x: 700, y: 200, width: 400, height: 300 },
      { name: 'C', x: 1600, y: 0, width: 300, height: 200 },
      { name: 'D', x: -500, y: 900, width: 1200, height: 200 },
      { name: 'E', x: 300, y: 1050, width: 200, height: 90 },
    ]
    for (const rect of rects) board(rect.name)
    canvas({ version: 1, pages: [page(rects.map((rect) => at(rect.name, rect.x, rect.y, rect)))] })
    const pairs = lintDesign(dir).problems
      .filter((p) => p.rule === 'board-overlap')
      .map((p) => /boards \S+ and \S+ cover/.exec(p.message)?.[0])
    // Gap 0 is the same question: the frames that share area. A rule that drifted from the canvas
    // predicate fails here rather than in a review.
    expect(pairs).toEqual(
      findOverlaps(rects, 0).map(([first, second]) => `boards ${first} and ${second} cover`),
    )
  })
})

describe('lintDesign board files', () => {
  it('warns about the legacy name and both forms', () => {
    writeFileSync(join(dir, 'Old.dc.html'), html('Old'))
    board('Twin')
    writeFileSync(join(dir, 'Twin.dc.html'), html('Twin'))
    canvas({ version: 1, pages: [page([entry('Old'), entry('Twin')])] })
    const result = lintDesign(dir)
    expect(result.ok).toBe(true)
    expect(rules(result)).toEqual(expect.arrayContaining(['board-legacy-name', 'board-both-forms']))
  })

  it('requires a title tag and a script with valid JSON', () => {
    board('NoTitle', '<html><head></head><body><x-dc></x-dc><script type="text/x-dc" data-props=\'{}\'></script></body></html>')
    board('Static', '<html><head><title>x</title></head><body><x-dc></x-dc></body></html>')
    board('BadJson', '<html><head><title>x</title></head><body><x-dc></x-dc><script type="text/x-dc" data-props=\'{bad\'></script></body></html>')
    canvas({ version: 1, pages: [page([entry('NoTitle'), entry('Static'), entry('BadJson')])] })
    const result = lintDesign(dir)
    expect(result.problems.filter((p) => p.rule === 'board-title-tag').map((p) => p.file)).toEqual(['NoTitle.html'])
    expect(result.problems.filter((p) => p.rule === 'board-script').map((p) => p.file)).toEqual(['BadJson.html'])
  })

  it('warns when the preview size is missing', () => {
    board('A', html('A', null))
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(rules()).toEqual(['board-preview'])
  })

  it('reports an import of a board without a file', () => {
    board('A', html('A', { width: 800, height: 600 }, '<dc-import name="Ghost"></dc-import><dc-import name="B"></dc-import>'))
    board('B')
    canvas({ version: 1, pages: [page([entry('A'), entry('B')])] })
    const found = lintDesign(dir).problems.filter((p) => p.rule === 'board-import-missing')
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain('Ghost')
  })

  it('checks the root language only when boardLanguage is en', () => {
    board('A', '<html><head><title>A</title></head><body><x-dc></x-dc><script type="text/x-dc" data-props=\'{"$preview":{"width":800,"height":600}}\'></script></body></html>')
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(rules()).toEqual([])
    writeFileSync(join(base, '.irsim.json'), JSON.stringify({ boardLanguage: 'en' }))
    expect(rules()).toEqual(['board-root-lang'])
    writeFileSync(join(base, '.irsim.json'), JSON.stringify({ boardLanguage: 'ar' }))
    expect(rules()).toEqual([])
  })
})

describe('lintDesign canvas shape and board templates', () => {
  it('requires overrides and bindings, and names irsim build when they are absent', () => {
    board('A')
    canvas({ version: 1, pages: [page([entry('A')])], overrides: undefined, bindings: undefined })
    const result = lintDesign(dir)
    expect(result.ok).toBe(false)
    const found = result.problems.filter((p) => p.rule === 'canvas-overrides' || p.rule === 'canvas-bindings')
    expect(found.map((p) => `${p.rule}:${p.path}:${p.severity}`)).toEqual([
      'canvas-bindings:bindings:error',
      'canvas-overrides:overrides:error',
    ])
    expect(found.every((p) => p.fix === 'run irsim build')).toBe(true)
  })

  it('names the exact JSON when overrides or bindings are malformed', () => {
    board('A')
    canvas({ version: 1, pages: [page([entry('A')])], overrides: { colors: {}, radius: 1, type: {} }, bindings: { a: 1 } })
    const found = lintDesign(dir).problems.filter((p) => p.rule === 'canvas-overrides' || p.rule === 'canvas-bindings')
    expect(found.find((p) => p.rule === 'canvas-overrides')?.fix).toContain('{"colors": {}, "radius": {}, "type": {}}')
    expect(found.find((p) => p.rule === 'canvas-bindings')?.fix).toContain('{}')
  })

  it('reports a page without a boards array', () => {
    canvas({ version: 1, pages: [{ id: 'p', title: 'P' }] })
    const found = lintDesign(dir).problems.filter((p) => p.rule === 'page-boards')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ severity: 'error', path: 'pages[0].boards' })
  })

  it('finds the script by its type in any attribute order and single quotes', () => {
    board('A', "<html><head><title>A</title></head><body><x-dc></x-dc><script data-props='{bad' type='text/x-dc'></script></body></html>")
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(lintDesign(dir).problems.filter((p) => p.rule === 'board-script')).toHaveLength(1)
  })

  it('reports a board file without an x-dc element', () => {
    board('A', '<html><head><title>A</title></head><body><script type="text/x-dc" data-props=\'{"$preview":{"width":800,"height":600}}\'></script></body></html>')
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(rules()).toEqual(['board-template'])
  })

  it('reads boardLanguage from the nearest .irsim.json above the design folder', () => {
    const nested = join(base, 'a', 'b', 'design')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'A.html'), '<html><head><title>A</title></head><body><x-dc></x-dc></body></html>')
    writeFileSync(join(nested, 'canvas.json'), JSON.stringify({ version: 1, pages: [page([entry('A')])], ...EMPTY }))
    writeFileSync(join(base, '.irsim.json'), JSON.stringify({ boardLanguage: 'en' }))
    expect(rules(lintDesign(nested))).toEqual(['board-root-lang'])
    writeFileSync(join(base, 'a', '.irsim.json'), JSON.stringify({ boardLanguage: 'ar' }))
    expect(rules(lintDesign(nested))).toEqual([])
  })
})

describe('readBoardMeta', () => {
  it('reads title and preview size, with defaults', () => {
    expect(readBoardMeta(html('T &amp; U', { width: 500, height: 300 }))).toEqual({ title: 'T & U', width: 500, height: 300 })
    expect(readBoardMeta(html('T', null))).toEqual({ title: 'T', width: 1440, height: 900 })
  })
})

describe('lint-design copies', () => {
  it('keeps bin and app copies byte-equal', () => {
    const root = resolve(import.meta.dirname, '..', '..')
    const a = readFileSync(join(root, 'bin', 'lib', 'lint-design.mjs'))
    const b = readFileSync(join(root, 'app', 'src', 'lib', 'lint-design.mjs'))
    expect(a.equals(b)).toBe(true)
  })
})

describe('lintDesign plain html and entities', () => {
  it('reports board-file-missing for an entry whose Name.html is not a board', () => {
    writeFileSync(join(dir, 'Notes.html'), '<html><body>plain page</body></html>')
    canvas({ version: 1, pages: [page([entry('Notes')])] })
    const result = lintDesign(dir)
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.rule === 'board-file-missing' && p.severity === 'error')).toBe(true)
  })

  it('decodes numeric entities in data-props', () => {
    board('A', '<html lang="en" dir="ltr"><head><title>A</title></head><body><x-dc></x-dc><script type="text/x-dc" data-props="{&#34;$preview&#34;:{&#x22;width&#x22;:800,&#34;height&#34;:600}}"></script></body></html>')
    canvas({ version: 1, pages: [page([entry('A')])] })
    expect(lintDesign(dir)).toEqual({ ok: true, problems: [] })
  })
})
