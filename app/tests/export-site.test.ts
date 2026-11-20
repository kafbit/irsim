import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const LAUNCHER = resolve(__dirname, '../../bin/irsim')

type Preview = {
  title: string
  pages: { id: string; title: string; boards: { name: string; title: string }[] }[]
}

type BoardOptions = {
  size?: { width: number; height: number }
  imports?: string[]
  content?: string
}

const board = (title: string, options: BoardOptions = {}) =>
  `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${title}</title>
<script src="./support.js"></script></head><body>
<x-dc>${options.content ?? `<div>${title}</div>`}${(options.imports ?? [])
    .map((name) => `<dc-import name="${name}"></dc-import>`)
    .join('')}</x-dc>
<script type="text/x-dc" data-props='${JSON.stringify(options.size ? { $preview: options.size } : {})}'>
class Component extends DCLogic { renderVals() { return {} } }
</script></body></html>`

let dir = ''
let out = ''

const add = (name: string, title: string, options: BoardOptions = {}) =>
  writeFileSync(join(dir, `${name}.dc.html`), board(title, options))

const writeCanvas = (pages: unknown) =>
  writeFileSync(
    join(dir, 'canvas.json'),
    JSON.stringify({ version: 1, pages, overrides: { colors: {}, radius: {}, type: {} }, bindings: {} }),
  )

const page = (name: string, title: string, x = 0, y = 0, width = 800, height = 600) => ({
  name,
  title,
  x,
  y,
  width,
  height,
})

const run = (...args: string[]) =>
  spawnSync('node', [LAUNCHER, 'export', '--design-dir', dir, '--out', out, ...args], {
    encoding: 'utf8',
  })

const read = (path: string) => readFileSync(join(out, path), 'utf8')

const preview = (): Preview => {
  const source = read('data.js')
  const json = /^window\.__IRSIM_PREVIEW__ = (.*);\n$/s.exec(source)?.[1]
  if (!json) throw new Error('data.js has no preview payload')
  return JSON.parse(json) as Preview
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-export-design-'))
  out = mkdtempSync(join(tmpdir(), 'irsim-export-out-'))
  rmSync(out, { recursive: true, force: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

describe('irsim export', () => {
  it('writes the index, the viewer assets, the runtime and a frame per board', () => {
    add('Root', 'Root screen')
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    const result = run('--title', 'Review build')

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`wrote ${out}: 1 pages, 1 boards`)
    expect(read('index.html')).toContain('<title>Review build</title>')
    expect(read('index.html')).toContain('<script src="data.js"></script>')
    expect(read('index.html')).toContain('<script src="preview.js"></script>')
    expect(existsSync(join(out, 'preview.css'))).toBe(true)
    expect(existsSync(join(out, 'preview.js'))).toBe(true)
    expect(existsSync(join(out, 'runtime', 'support.js'))).toBe(true)
    expect(existsSync(join(out, 'runtime', 'component.js'))).toBe(true)
  })

  it('lists the canvas pages in data.js', () => {
    add('Root', 'Root screen')
    add('Other', 'Other screen')
    writeCanvas([
      {
        id: 'main',
        title: 'Main page',
        boards: [page('Root', 'Root screen'), page('Other', 'Other screen', 900, 0)],
      },
    ])

    expect(run().status).toBe(0)
    const data = preview()
    expect(data.title).toBe('irsim preview')
    expect(data.pages.map((entry) => [entry.id, entry.title])).toEqual([['main', 'Main page']])
    expect(data.pages[0]?.boards.map((entry) => entry.name)).toEqual(['Root', 'Other'])
  })

  it('turns a board into a frame with its closure embedded and its source escaped', () => {
    add('Root', 'Root screen', { imports: ['Leaf'], content: '<div class="root">Root</div>' })
    add('Leaf', 'Leaf part')
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    expect(run().status).toBe(0)
    const frame = read('b/Root.html')

    expect(frame).toContain('<script type="module" src="../runtime/support.js"></script>')
    expect(frame).not.toContain('<script src="./support.js"></script>')
    expect(frame).toContain('&lt;script src="./support.js">')
    expect(frame).toContain('<x-dc></x-dc>')
    expect(frame).toContain('id="dc-bundle"')
    expect(frame).toContain('"root":"Root"')
    expect(frame).toContain('"Leaf"')
    expect(frame).toContain('id="dc-root"')
    expect(frame).toContain('&lt;x-dc>')
    expect(frame).toContain('&lt;dc-import name="Leaf">')
    expect(frame).not.toContain('<dc-import name="Leaf">')
  })

  it('injects the shared css after the head tag, lists the modules and copies the folder', () => {
    add('Root', 'Root screen')
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])
    mkdirSync(join(dir, 'shared', 'ui'), { recursive: true })
    writeFileSync(join(dir, 'shared', 'base.css'), '.a{color:red}')
    writeFileSync(join(dir, 'shared', 'ui', 'format.js'), 'export const money = (n) => n')
    writeFileSync(join(dir, 'shared', 'logo.svg'), '<svg></svg>')

    expect(run().status).toBe(0)
    const frame = read('b/Root.html')

    expect(frame).toContain('<head><style data-irsim-shared>/* base.css */\n.a{color:red}\n</style>')
    expect(frame).toContain('"shared":["ui/format.js"]')
    expect(read('b/shared/logo.svg')).toBe('<svg></svg>')
    expect(existsSync(join(out, 'b', 'shared', 'ui', 'format.js'))).toBe(true)
  })

  it('adds a board that canvas.json does not list to an Unsorted page', () => {
    add('Root', 'Root screen')
    add('Loose', 'Loose screen', { size: { width: 640, height: 480 } })
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    expect(run().status).toBe(0)
    const data = preview()
    expect(data.pages.map((entry) => entry.id)).toEqual(['main', 'unsorted'])
    expect(data.pages[1]?.boards.map((entry) => entry.name)).toEqual(['Loose'])
    expect(existsSync(join(out, 'b', 'Loose.html'))).toBe(true)
  })

  it('builds canvas.json when the design folder has none', () => {
    add('Root', 'Root screen')

    expect(run().status).toBe(0)
    expect(existsSync(join(dir, 'canvas.json'))).toBe(true)
    expect(preview().pages.map((entry) => entry.id)).toEqual(['unsorted'])
  })

  it('drops frames of boards removed since the last export', () => {
    add('Root', 'Root screen')
    add('Temp', 'Temp screen')
    writeCanvas([
      {
        id: 'main',
        title: 'Main',
        boards: [page('Root', 'Root screen'), page('Temp', 'Temp screen')],
      },
    ])
    expect(run().status).toBe(0)
    expect(existsSync(join(out, 'b', 'Temp.html'))).toBe(true)

    rmSync(join(dir, 'Temp.dc.html'))
    expect(run().status).toBe(0)
    expect(existsSync(join(out, 'b', 'Temp.html'))).toBe(false)
  })

  it('reports a missing import but still writes the frame', () => {
    add('Root', 'Root screen', { imports: ['Gone'] })
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    const result = run()

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Root imports missing Gone')
    expect(read('b/Root.html')).toContain('"missing":["Gone"]')
  })

  it('refuses to write the preview into the design folder', () => {
    add('Root', 'Root screen')
    const result = spawnSync('node', [LAUNCHER, 'export', '--design-dir', dir, '--out', dir], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('refusing to write')
  })

  it('refuses an out folder that holds the design folder', () => {
    const parent = mkdtempSync(join(tmpdir(), 'irsim-export-parent-'))
    try {
      const design = join(parent, 'design')
      mkdirSync(design)
      writeFileSync(join(design, 'Root.dc.html'), board('Root screen'))
      const result = spawnSync('node', [LAUNCHER, 'export', '--design-dir', design, '--out', parent], {
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('overlaps the design folder')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('skips a file whose name cannot be a board', () => {
    add('Root', 'Root screen')
    writeFileSync(join(dir, 'bad-name.dc.html'), board('Bad name'))
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    expect(run().status).toBe(0)
    expect(preview().pages.flatMap((entry) => entry.boards.map((b) => b.name))).toEqual(['Root'])
    expect(existsSync(join(out, 'b', 'bad-name.html'))).toBe(false)
  })

  it('escapes the title and keeps crawlers away', () => {
    add('Root', 'Root screen')
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])

    expect(run('--title', '<Review & "build">').status).toBe(0)
    const index = read('index.html')
    expect(index).toContain('<title>&lt;Review &amp; &quot;build&quot;&gt;</title>')
    expect(index).toContain('name="robots" content="noindex, nofollow"')
  })

  it('keeps the pages of canvas.json even when the only board is unlisted', () => {
    add('Loose', 'Loose screen')
    writeCanvas([{ id: 'main', title: 'Main', boards: [] }])

    expect(run().status).toBe(0)
    const data = preview()
    expect(data.pages.map((entry) => entry.id)).toEqual(['main', 'unsorted'])
  })

  it('runs without app dependencies installed', () => {
    add('Root', 'Root screen')
    writeCanvas([{ id: 'main', title: 'Main', boards: [page('Root', 'Root screen')] }])
    mkdirSync(out, { recursive: true })
    const result = spawnSync('node', [LAUNCHER, 'export', '--design-dir', dir, '--out', out], {
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: '' },
    })
    expect(result.status, result.stderr).toBe(0)
  })
})
