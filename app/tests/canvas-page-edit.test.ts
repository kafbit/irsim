import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PATCH } from '../src/app/api/canvas/route'
import { POST as checkPage } from '../src/app/api/pages/[pageId]/check/route'
import { applyEdit, type CanvasFile } from '../src/lib/canvas-layout'

const base = (): CanvasFile => ({
  version: 1,
  pages: [
    {
      id: 'sales',
      title: 'Sales',
      icon: 'house',
      sections: [{ id: 'main', title: 'Main' }],
      boards: [],
    },
  ],
  overrides: { colors: {}, radius: {}, type: {} },
  bindings: {},
})

describe('canvas page edits', () => {
  let root: string
  const saved = process.env.IRSIM_DESIGN_DIR
  const file = () => join(root, 'canvas.json')
  const page = () => (JSON.parse(readFileSync(file(), 'utf8')) as CanvasFile).pages[0] as Record<string, unknown>
  const patch = (body: unknown) =>
    PATCH(new Request('http://x/api/canvas', { method: 'PATCH', body: JSON.stringify(body) }))

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'canvas-page-edit-'))
    mkdirSync(root, { recursive: true })
    writeFileSync(file(), JSON.stringify(base()))
    process.env.IRSIM_DESIGN_DIR = root
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved
    rmSync(root, { recursive: true, force: true })
  })

  it('trims and sets the title', async () => {
    expect((await patch({ page: 'sales', title: '  Deals  ' })).status).toBe(200)
    expect(page().title).toBe('Deals')
  })

  it('400 for an empty or long title', async () => {
    expect((await patch({ page: 'sales', title: '   ' })).status).toBe(400)
    expect((await patch({ page: 'sales', title: 'x'.repeat(121) })).status).toBe(400)
    expect(page().title).toBe('Sales')
  })

  it('sets a Lucide icon, 400 for an unknown one, and null removes it', async () => {
    expect((await patch({ page: 'sales', icon: 'star' })).status).toBe(200)
    expect(page().icon).toBe('star')
    const unknown = await patch({ page: 'sales', icon: 'not-an-icon' })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'unknown icon' })
    expect((await patch({ page: 'sales', icon: null })).status).toBe(200)
    expect(page()).not.toHaveProperty('icon')
  })

  it('404 for an unknown page', async () => {
    expect((await patch({ page: 'nope', title: 'X' })).status).toBe(404)
  })

  it('warns in the page check when the icon is not a Lucide icon', async () => {
    const canvas = base()
    ;(canvas.pages[0] as Record<string, unknown>).icon = 'bogus'
    writeFileSync(file(), JSON.stringify(canvas))
    const response = await checkPage(new Request('http://x:1/api/pages/sales/check', { method: 'POST' }), {
      params: Promise.resolve({ pageId: 'sales' }),
    })
    expect(await response.json()).toEqual([
      { board: 'sales', ok: false, ms: 0, errors: [], warnings: ['page icon "bogus" is not a Lucide icon'] },
    ])
  })
})

describe('section layout edit', () => {
  const edit = (layout: unknown) =>
    applyEdit(base(), 'sales', { sections: { set: [{ id: 'main', title: 'Main', layout } as never] } })

  it('sets and clears a wrap layout', () => {
    const set = edit({ mode: 'wrap', gap: 24 })
    if ('error' in set) throw new Error(set.error)
    expect((set.canvas.pages[0]?.sections as { layout?: unknown }[])[0]?.layout).toEqual({ mode: 'wrap', gap: 24 })
    const cleared = applyEdit(set.canvas, 'sales', { sections: { set: [{ id: 'main', title: 'Main', layout: null }] } })
    if ('error' in cleared) throw new Error(cleared.error)
    expect(cleared.canvas.pages[0]?.sections?.[0]).toEqual({ id: 'main', title: 'Main' })
  })

  it('400 for another mode or a gap outside 0 to 400', () => {
    expect(edit({ mode: 'grid', gap: 10 })).toMatchObject({ status: 400 })
    expect(edit({ mode: 'wrap', gap: -1 })).toMatchObject({ status: 400 })
    expect(edit({ mode: 'wrap', gap: 401 })).toMatchObject({ status: 400 })
    expect(edit({ mode: 'wrap', gap: Number.NaN })).toMatchObject({ status: 400 })
  })
})
