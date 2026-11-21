import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCanvasPages } from '../src/lib/canvas-pages'

let dir = ''
let saved: string | undefined

const board = (title: string, size?: { width: number; height: number }) =>
  `<html><head><title>${title}</title></head><body><x-dc></x-dc>` +
  `<script type="text/x-dc" data-props='${JSON.stringify(size ? { $preview: size } : {})}'></script></body></html>`
const canvas = (value: unknown) => writeFileSync(join(dir, 'canvas.json'), JSON.stringify(value))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-normalize-'))
  saved = process.env.IRSIM_DESIGN_DIR
  process.env.IRSIM_DESIGN_DIR = dir
})

afterEach(() => {
  if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
  else process.env.IRSIM_DESIGN_DIR = saved
  rmSync(dir, { recursive: true, force: true })
})

describe('readCanvasPages normalization', () => {
  it('fills title, size and position of the incident file and leaves the file alone', async () => {
    writeFileSync(join(dir, 'A.html'), board('Screen A', { width: 800, height: 600 }))
    writeFileSync(join(dir, 'B.dc.html'), board('Screen B'))
    canvas({ version: 1, pages: [{ id: 'p', title: 'P', boards: [{ name: 'A', x: 0, y: 0 }, { name: 'B' }] }] })
    const before = readFileSync(join(dir, 'canvas.json'), 'utf8')

    const [page] = await readCanvasPages()

    expect(page?.boards[0]).toEqual({ name: 'A', title: 'Screen A', x: 0, y: 0, width: 800, height: 600 })
    expect(page?.boards[1]).toEqual({ name: 'B', title: 'Screen B', x: 0, y: 680, width: 1440, height: 900 })
    expect(readFileSync(join(dir, 'canvas.json'), 'utf8')).toBe(before)
  })

  it('uses the preview size of the file as it is, without a minimum', async () => {
    writeFileSync(join(dir, 'Small.html'), board('Small', { width: 120, height: 80 }))
    canvas({ version: 1, pages: [{ id: 'p', title: 'P', boards: [{ name: 'Small', x: 0, y: 0 }] }] })
    const [page] = await readCanvasPages()
    expect(page?.boards[0]).toMatchObject({ title: 'Small', width: 120, height: 80 })
  })

  it('drops a board with no file', async () => {
    writeFileSync(join(dir, 'A.html'), board('A'))
    canvas({ version: 1, pages: [{ id: 'p', title: 'P', boards: [{ name: 'A', title: 'A', x: 0, y: 0, width: 800, height: 600 }, { name: 'Gone', title: 'G', x: 0, y: 0, width: 800, height: 600 }] }] })
    const [page] = await readCanvasPages()
    expect(page?.boards.map((b) => b.name)).toEqual(['A'])
  })

  it('returns a valid file unchanged', async () => {
    writeFileSync(join(dir, 'A.html'), board('A'))
    const value = {
      version: 1,
      pages: [
        {
          id: 'p',
          title: 'P',
          icon: 'home',
          sections: [{ id: 's', title: 'S', color: 'blue' }],
          boards: [{ name: 'A', title: 'A', x: 10, y: 20, width: 800, height: 600, section: 's' }],
        },
      ],
    }
    canvas(value)
    expect(await readCanvasPages()).toEqual(value.pages)
  })

  it('repairs a page without boards and sections of the wrong shape', async () => {
    canvas({ version: 1, pages: [{ id: 'p', title: 'P' }, { id: 'q', title: 'Q', sections: 'x', boards: [] }, { id: 'r', title: 'R', sections: [{ id: 'only' }], boards: [] }] })
    const pages = await readCanvasPages()
    expect(pages[0]?.boards).toEqual([])
    expect(pages[1]?.sections).toEqual([])
    expect(pages[2]?.sections).toEqual([{ id: 'only', title: 'only' }])
  })
})
