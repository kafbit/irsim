import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/api/thumbs/[board]/route'
import { closureOf } from '../src/lib/closure'
import { thumbFile } from '../src/lib/thumbs-dir'

describe('GET /api/thumbs/[board]', () => {
  let root: string
  let designPath: string
  let thumbsPath: string
  const saved = { design: process.env.CANVAS_DESIGN_DIR, thumbs: process.env.CANVAS_THUMBS_DIR }

  const request = (board: string, hash?: string) =>
    GET(new Request(`http://x/api/thumbs/${board}${hash ? `?h=${hash}` : ''}`), {
      params: Promise.resolve({ board }),
    })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thumbs-route-'))
    designPath = join(root, 'design')
    thumbsPath = join(root, 'thumbs')
    mkdirSync(designPath)
    mkdirSync(thumbsPath)
    writeFileSync(join(designPath, 'Tiny.dc.html'), '<x-dc>tiny</x-dc>')
    process.env.CANVAS_DESIGN_DIR = designPath
    process.env.CANVAS_THUMBS_DIR = thumbsPath
  })

  afterEach(() => {
    if (saved.design === undefined) delete process.env.CANVAS_DESIGN_DIR
    else process.env.CANVAS_DESIGN_DIR = saved.design
    if (saved.thumbs === undefined) delete process.env.CANVAS_THUMBS_DIR
    else process.env.CANVAS_THUMBS_DIR = saved.thumbs
    rmSync(root, { recursive: true, force: true })
  })

  it('404 when no thumbnail exists', async () => {
    expect((await request('Tiny')).status).toBe(404)
  })

  it('400 for an invalid name and 404 for an unknown board', async () => {
    expect((await request('../x')).status).toBe(400)
    expect((await request('Nope')).status).toBe(404)
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

  it('404 after the board changes, so a stale file is not served', async () => {
    const { hash } = await closureOf('Tiny')
    writeFileSync(join(thumbsPath, thumbFile('Tiny', hash)), 'webp-bytes')
    const file = join(designPath, 'Tiny.dc.html')
    writeFileSync(file, '<x-dc>tiny, changed</x-dc>')
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    expect((await request('Tiny')).status).toBe(404)
  })
})
