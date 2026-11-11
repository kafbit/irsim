import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/api/comments/images/[id]/route'
import { POST } from '../src/app/api/comments/images/route'
import { MAX_IMAGE_BYTES } from '../src/lib/comment-images'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const png = (size = 16): Uint8Array => {
  const out = new Uint8Array(size)
  out.set(PNG)
  return out
}

const upload = (body: Uint8Array | string, headers: Record<string, string> = {}) =>
  POST(new Request('http://x/api/comments/images', { method: 'POST', body, headers }))

const fetchImage = (id: string) =>
  GET(new Request(`http://x/api/comments/images/${id}`), { params: Promise.resolve({ id }) })

describe('comment image routes', () => {
  let dir: string
  const saved = process.env.IRSIM_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-image-route-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('round trips an image with its sniffed content type and an immutable cache', async () => {
    const created = await upload(png(), { 'content-type': 'text/plain' })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    const response = await fetchImage(id)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png())
  })

  it('415 for a body that is not an image', async () => {
    expect((await upload('hello')).status).toBe(415)
  })

  it('413 for a body over 5 MB, declared or not', async () => {
    const big = png(MAX_IMAGE_BYTES + 1)
    expect((await upload(big)).status).toBe(413)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big)
        controller.close()
      },
    })
    const chunked = new Request('http://x/api/comments/images', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect((await POST(chunked)).status).toBe(413)
  })

  it('404 for an unknown id and 400 for a bad one', async () => {
    expect((await fetchImage('i_missing')).status).toBe(404)
    expect((await fetchImage('..%2Fx')).status).toBe(400)
  })
})
