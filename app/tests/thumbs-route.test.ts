import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closureOf } from '../src/lib/closure'
import { thumbFile } from '../src/lib/thumbs-dir'

const enqueue = vi.fn(async (_board: string, _base: string): Promise<'queued' | 'failed'> => 'queued')
const failure = vi.fn((_board: string, _hash: string): string | undefined => undefined)
vi.mock('../src/lib/thumbs', () => ({ enqueueThumb: enqueue, thumbFailure: failure }))

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

  it('200 with the file of the current hash', async () => {
    const { hash } = await closureOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile('Tiny', hash)), 'webp-bytes')
    const response = await request('Tiny')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe('webp-bytes')
  })

  it('immutable only when h equals the current hash', async () => {
    const { hash } = await closureOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile('Tiny', hash)), 'webp-bytes')
    expect((await request('Tiny', hash)).headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect((await request('Tiny', 'deadbeef0000')).headers.get('cache-control')).toBe('no-cache')
  })

  it('does not serve a stale file after the board changes', async () => {
    const { hash } = await closureOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile('Tiny', hash)), 'webp-bytes')
    const file = join(designPath, 'Tiny.dc.html')
    writeFileSync(file, '<x-dc>tiny, changed</x-dc>')
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    expect((await request('Tiny')).status).toBe(202)
  })
})
