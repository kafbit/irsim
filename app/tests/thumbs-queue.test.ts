import { existsSync, mkdirSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { subscribe, type CanvasEvent } from '../src/lib/events'
import { thumbFile } from '../src/lib/thumbs-dir'
import { readThumbIndex } from '../src/lib/thumbs-index'

const NO_CHROMIUM =
  'No Chromium-based browser found: install Chrome, Chromium, Brave or Edge, or set IRSIM_BROWSER to its executable'

type Outcome = { fatal?: string; hold?: Promise<void>; unavailable?: boolean }
const outcomes = new Map<string, Outcome>()
const rendered: string[] = []
let png: Buffer

vi.mock('../src/lib/board-check', () => ({
  NO_CHROMIUM,
  checkBoards: async () => [],
  withBrowser: async (use: (browser: object) => Promise<unknown>) => {
    if ([...outcomes.values()].some((outcome) => outcome.unavailable)) throw new Error(NO_CHROMIUM)
    return use({})
  },
  inspectBoard: async (_browser: object, _base: string, target: { name: string }) => {
    rendered.push(target.name)
    const outcome = outcomes.get(target.name) ?? {}
    await outcome.hold
    return outcome.fatal ? { fatal: outcome.fatal } : { png }
  },
}))

const { enqueueThumb, thumbFailure, thumbKeyOf } = await import('../src/lib/thumbs')

describe('thumb queue', () => {
  let root: string
  let thumbsPath: string
  const saved = { design: process.env.IRSIM_DESIGN_DIR, thumbs: process.env.IRSIM_THUMBS_DIR }

  const done = (board: string) =>
    new Promise<CanvasEvent>((resolve) => {
      const stop = subscribe((event) => {
        if (event.event === 'thumb' && event.data.board === board) {
          stop()
          resolve(event)
        }
      })
    })

  beforeAll(async () => {
    png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } })
      .png()
      .toBuffer()
    root = mkdtempSync(join(tmpdir(), 'thumbs-queue-'))
    const designPath = join(root, 'design')
    thumbsPath = join(root, 'thumbs')
    mkdirSync(designPath)
    for (const name of ['Once', 'Broken', 'Gone', 'Racing']) {
      writeFileSync(join(designPath, `${name}.dc.html`), `<x-dc>${name}</x-dc>`)
    }
    writeFileSync(
      join(designPath, 'canvas.json'),
      JSON.stringify({
        pages: [
          {
            id: 'p',
            title: 'P',
            boards: [
              { name: 'Racing', title: 'Racing', x: 0, y: 0, width: 100, height: 100 },
              { name: 'SizeA', title: 'SizeA', x: 0, y: 0, width: 100, height: 100 },
              { name: 'SizeB', title: 'SizeB', x: 0, y: 0, width: 200, height: 100 },
            ],
          },
        ],
      }),
    )
    for (const name of ['SizeA', 'SizeB']) {
      writeFileSync(join(designPath, `${name}.dc.html`), '<x-dc>Sized</x-dc>')
    }
    process.env.IRSIM_DESIGN_DIR = designPath
    process.env.IRSIM_THUMBS_DIR = thumbsPath
  })

  afterAll(() => {
    if (saved.design === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved.design
    if (saved.thumbs === undefined) delete process.env.IRSIM_THUMBS_DIR
    else process.env.IRSIM_THUMBS_DIR = saved.thumbs
    rmSync(root, { recursive: true, force: true })
  })

  it('renders a board once when it is enqueued twice, writes the file and emits ok', async () => {
    let release = () => {}
    outcomes.set('Once', { hold: new Promise<void>((resolve) => (release = resolve)) })
    const finished = done('Once')
    expect(await enqueueThumb('Once', 'http://localhost:1')).toBe('queued')
    expect(await enqueueThumb('Once', 'http://localhost:1')).toBe('queued')
    release()
    expect((await finished).data).toEqual({ board: 'Once', ok: true })
    expect(rendered.filter((name) => name === 'Once')).toHaveLength(1)
    const { key } = await thumbKeyOf('Once')
    expect(existsSync(join(thumbsPath, thumbFile(key)))).toBe(true)
    expect(readdirSync(thumbsPath).filter((file) => file.startsWith(`${thumbFile(key)}.`))).toEqual([])
    expect((await readThumbIndex()).Once?.[0]?.key).toBe(key)
  })

  it('renders a board once when two enqueues for it start together', async () => {
    const finished = done('Racing')
    const results = await Promise.all([
      enqueueThumb('Racing', 'http://localhost:1'),
      enqueueThumb('Racing', 'http://localhost:1'),
    ])
    expect(results).toEqual(['queued', 'queued'])
    expect((await finished).data).toEqual({ board: 'Racing', ok: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(rendered.filter((name) => name === 'Racing')).toHaveLength(1)
  })

  it('renders the same source at two sizes as two thumbnails', async () => {
    const a = await thumbKeyOf('SizeA')
    const b = await thumbKeyOf('SizeB')
    expect(a.render).toBe(b.render)
    expect(a.key).not.toBe(b.key)
    const finished = Promise.all([done('SizeA'), done('SizeB')])
    expect(await enqueueThumb('SizeA', 'http://localhost:1')).toBe('queued')
    expect(await enqueueThumb('SizeB', 'http://localhost:1')).toBe('queued')
    await finished
    expect(rendered.filter((name) => name === 'SizeA' || name === 'SizeB')).toHaveLength(2)
    expect(existsSync(join(thumbsPath, thumbFile(a.key)))).toBe(true)
    expect(existsSync(join(thumbsPath, thumbFile(b.key)))).toBe(true)
  })

  it('remembers a failed render: no retry, the message is reported, a failed event is emitted', async () => {
    outcomes.set('Broken', { fatal: 'the board was not ready after 15 s' })
    const finished = done('Broken')
    expect(await enqueueThumb('Broken', 'http://localhost:1')).toBe('queued')
    expect((await finished).data).toEqual({ board: 'Broken', ok: false })
    const { key } = await thumbKeyOf('Broken')
    expect(thumbFailure('Broken', key)).toBe('the board was not ready after 15 s')
    expect(await enqueueThumb('Broken', 'http://localhost:1')).toBe('failed')
    expect(rendered.filter((name) => name === 'Broken')).toHaveLength(1)
  })

  it('refuses every board once Chromium is not installed', async () => {
    outcomes.set('Gone', { unavailable: true })
    const finished = done('Gone')
    expect(await enqueueThumb('Gone', 'http://localhost:1')).toBe('queued')
    expect((await finished).data).toEqual({ board: 'Gone', ok: false })
    const { key } = await thumbKeyOf('Gone')
    expect(thumbFailure('Gone', key)).toBe(NO_CHROMIUM)
    expect(thumbFailure('Other', 'abc')).toBe(NO_CHROMIUM)
    expect(await enqueueThumb('Once', 'http://localhost:1')).toBe('failed')
  })
})
