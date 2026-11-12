import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { subscribe, type CanvasEvent } from '../src/lib/events'
import { closureOf } from '../src/lib/closure'
import { thumbFile } from '../src/lib/thumbs-dir'

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

const { enqueueThumb, thumbFailure } = await import('../src/lib/thumbs')

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
    for (const name of ['Once', 'Broken', 'Gone']) {
      writeFileSync(join(designPath, `${name}.dc.html`), `<x-dc>${name}</x-dc>`)
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
    const { hash } = await closureOf('Once')
    expect(existsSync(join(thumbsPath, thumbFile('Once', hash)))).toBe(true)
    expect(existsSync(join(thumbsPath, `${thumbFile('Once', hash)}.tmp`))).toBe(false)
  })

  it('remembers a failed render: no retry, the message is reported, a failed event is emitted', async () => {
    outcomes.set('Broken', { fatal: 'the board was not ready after 15 s' })
    const finished = done('Broken')
    expect(await enqueueThumb('Broken', 'http://localhost:1')).toBe('queued')
    expect((await finished).data).toEqual({ board: 'Broken', ok: false })
    const { hash } = await closureOf('Broken')
    expect(thumbFailure('Broken', hash)).toBe('the board was not ready after 15 s')
    expect(await enqueueThumb('Broken', 'http://localhost:1')).toBe('failed')
    expect(rendered.filter((name) => name === 'Broken')).toHaveLength(1)
  })

  it('refuses every board once Chromium is not installed', async () => {
    outcomes.set('Gone', { unavailable: true })
    const finished = done('Gone')
    expect(await enqueueThumb('Gone', 'http://localhost:1')).toBe('queued')
    expect((await finished).data).toEqual({ board: 'Gone', ok: false })
    const { hash } = await closureOf('Gone')
    expect(thumbFailure('Gone', hash)).toBe(NO_CHROMIUM)
    expect(thumbFailure('Other', 'abc')).toBe(NO_CHROMIUM)
    expect(await enqueueThumb('Once', 'http://localhost:1')).toBe('failed')
  })
})
