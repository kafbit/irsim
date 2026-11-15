import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/api/search/route'

describe('GET /api/search', () => {
  let root: string
  const saved = process.env.IRSIM_DESIGN_DIR

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'search-route-'))
    const design = join(root, 'design')
    mkdirSync(design)
    writeFileSync(join(design, 'Button.dc.html'), '<x-dc>button</x-dc>')
    writeFileSync(
      join(design, 'Card.dc.html'),
      '<x-dc><dc-import name="Button"></dc-import><dc-import name="Button"></dc-import></x-dc>',
    )
    writeFileSync(
      join(design, 'Page.dc.html'),
      '<x-dc><dc-import name="Button"></dc-import><dc-import name="Card"></dc-import><a href="Card.dc.html">x</a></x-dc>',
    )
    const board = (name: string, extra: object = {}) => ({
      name,
      title: name,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      ...extra,
    })
    writeFileSync(
      join(design, 'canvas.json'),
      JSON.stringify({
        pages: [
          {
            id: 'main',
            title: 'Main',
            sections: [{ id: 'flow', title: 'Flow' }],
            boards: [board('Button'), board('Card', { section: 'flow' })],
          },
          { id: 'other', title: 'Other', boards: [board('Page')] },
        ],
      }),
    )
    process.env.IRSIM_DESIGN_DIR = design
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved
    rmSync(root, { recursive: true, force: true })
  })

  it('counts the boards that import each board', async () => {
    const body = await (await GET()).json()
    const used = Object.fromEntries(body.boards.map((b: { name: string; usedBy: number }) => [b.name, b.usedBy]))
    expect(used).toEqual({ Button: 2, Card: 1, Page: 0 })
  })

  it('lists sections, pages and the section of a board', async () => {
    const body = await (await GET()).json()
    expect(body.sections).toEqual([{ id: 'flow', title: 'Flow', page: 'main', pageTitle: 'Main', boards: 1 }])
    expect(body.pages).toEqual([
      { id: 'main', title: 'Main', boardCount: 2 },
      { id: 'other', title: 'Other', boardCount: 1 },
    ])
    const card = body.boards.find((b: { name: string }) => b.name === 'Card')
    expect(card).toMatchObject({ page: 'main', pageTitle: 'Main', section: 'flow', sectionTitle: 'Flow' })
  })

  it('marks a board with a link to another board as interactive', async () => {
    const body = await (await GET()).json()
    const interactive = body.boards.filter((b: { interactive: boolean }) => b.interactive).map((b: { name: string }) => b.name)
    expect(interactive).toEqual(['Page'])
  })
})
