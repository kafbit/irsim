import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCanvasPages } from '../src/lib/canvas-pages'
import { targetOf } from '../src/lib/check-route'
import { closureOf } from '../src/lib/closure'
import { thumbFile, thumbKey } from '../src/lib/thumbs-dir'
import { readThumbIndex, recordThumb } from '../src/lib/thumbs-index'

const enqueue = vi.fn(async (_board: string, _base: string): Promise<'queued' | 'failed'> => 'queued')
const failure = vi.fn((_board: string, _key: string): string | undefined => undefined)
const thumbKeyOf = async (board: string) => {
  const { render } = await closureOf(board)
  const placed = (await readCanvasPages()).flatMap((page) => page.boards).find((entry) => entry.name === board)
  const target = targetOf(board, placed)
  return { render, key: thumbKey(render, target), target }
}
vi.mock('../src/lib/thumbs', () => ({ enqueueThumb: enqueue, thumbFailure: failure, thumbKeyOf }))

const { GET } = await import('../src/app/api/thumbs/[board]/route')

describe('GET /api/thumbs/[board]', () => {
  let root: string
  let designPath: string
  let thumbsPath: string
  const saved = { design: process.env.IRSIM_DESIGN_DIR, thumbs: process.env.IRSIM_THUMBS_DIR }

  const request = (board: string, hash?: string) =>
    GET(new Request(`http://x/api/thumbs/${board}${hash ? `?h=${hash}` : ''}`), {
      params: Promise.resolve({ board }),
    })

  beforeEach(() => {
    enqueue.mockClear()
    failure.mockReset()
    failure.mockReturnValue(undefined)
    root = mkdtempSync(join(tmpdir(), 'thumbs-route-'))
    designPath = join(root, 'design')
    thumbsPath = join(root, 'thumbs')
    mkdirSync(designPath)
    mkdirSync(thumbsPath)
    writeFileSync(join(designPath, 'Tiny.dc.html'), '<x-dc>tiny</x-dc>')
    process.env.IRSIM_DESIGN_DIR = designPath
    process.env.IRSIM_THUMBS_DIR = thumbsPath
  })

  afterEach(() => {
    if (saved.design === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved.design
    if (saved.thumbs === undefined) delete process.env.IRSIM_THUMBS_DIR
    else process.env.IRSIM_THUMBS_DIR = saved.thumbs
    rmSync(root, { recursive: true, force: true })
  })

  it('202 pending and no-store when no thumbnail exists, and queues the board', async () => {
    const response = await request('Tiny')
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('pending')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0]?.[0]).toBe('Tiny')
  })

  it('404 with the reason and no-store when the render failed, without queueing again', async () => {
    failure.mockReturnValue('the board was not ready')
    const response = await request('Tiny')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('the board was not ready')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('400 for an invalid name and 404 for an unknown board', async () => {
    expect((await request('../x')).status).toBe(400)
    expect((await request('Nope')).status).toBe(404)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('200 with the file of the current key', async () => {
    const { key } = await thumbKeyOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile(key)), 'webp-bytes')
    const response = await request('Tiny')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe('webp-bytes')
  })

  it('immutable only when h equals the current key', async () => {
    const { key } = await thumbKeyOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile(key)), 'webp-bytes')
    expect((await request('Tiny', key)).headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect((await request('Tiny', 'deadbeef0000')).headers.get('cache-control')).toBe('no-cache')
  })

  it('a render hash alone is not the key, so a file named by the hash is not served', async () => {
    const { render } = await thumbKeyOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile(render)), 'webp-bytes')
    expect((await request('Tiny')).status).toBe(202)
  })

  it('the same source at another size is another file', async () => {
    writeFileSync(join(designPath, 'Twin.dc.html'), '<x-dc>tiny</x-dc>')
    writeFileSync(
      join(designPath, 'canvas.json'),
      JSON.stringify({
        pages: [
          {
            id: 'p',
            title: 'P',
            boards: [
              { name: 'Tiny', title: 'Tiny', x: 0, y: 0, width: 100, height: 100 },
              { name: 'Twin', title: 'Twin', x: 0, y: 0, width: 200, height: 100 },
            ],
          },
        ],
      }),
    )
    const tiny = await thumbKeyOf('Tiny')
    const twin = await thumbKeyOf('Twin')
    expect(twin.render).toBe(tiny.render)
    expect(twin.key).not.toBe(tiny.key)
    writeFileSync(join(thumbsPath, thumbFile(tiny.key)), 'small')
    expect(await (await request('Tiny')).text()).toBe('small')
    expect((await request('Twin')).status).toBe(202)
  })

  it('202 when the board changed and no older file is indexed', async () => {
    const { key } = await thumbKeyOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile(key)), 'webp-bytes')
    const file = join(designPath, 'Tiny.dc.html')
    writeFileSync(file, '<x-dc>tiny, changed</x-dc>')
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    expect((await request('Tiny')).status).toBe(202)
  })

  it('serves the older indexed file as stale after the board changes, and queues the new render', async () => {
    const { key } = await thumbKeyOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile(key)), 'old-bytes')
    await recordThumb('Tiny', key)
    const file = join(designPath, 'Tiny.dc.html')
    writeFileSync(file, '<x-dc>tiny, changed</x-dc>')
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    const response = await request('Tiny')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-thumb-stale')).toBe('1')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe('old-bytes')
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('identical content under two board names shares one thumbnail file', async () => {
    writeFileSync(join(designPath, 'Twin.dc.html'), '<x-dc>tiny</x-dc>')
    const first = await thumbKeyOf('Tiny')
    const second = await thumbKeyOf('Twin')
    expect(second.key).toBe(first.key)
    writeFileSync(join(thumbsPath, thumbFile(first.key)), 'shared')
    expect(await (await request('Tiny')).text()).toBe('shared')
    expect(await (await request('Twin')).text()).toBe('shared')
  })

  it('refreshes the mtime of a file older than 24 h and indexes a hit missing from the index', async () => {
    const { key } = await thumbKeyOf('Tiny')
    const path = join(thumbsPath, thumbFile(key))
    writeFileSync(path, 'webp-bytes')
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    utimesSync(path, old, old)
    expect((await request('Tiny')).status).toBe(200)
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (Date.now() - statSync(path).mtimeMs < 60_000 && (await readThumbIndex()).Tiny) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(Date.now() - statSync(path).mtimeMs).toBeLessThan(60_000)
    expect((await readThumbIndex()).Tiny?.[0]?.key).toBe(key)
  })
})
