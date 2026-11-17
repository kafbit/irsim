import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveImage } from '../src/lib/comment-images'
import { POST } from '../src/app/api/comments/[id]/reply/route'
import { createComment, sendDrafts, updateComment } from '../src/lib/comments-store'

const reply = (id: string, body: unknown) =>
  POST(
    new Request(`http://x/api/comments/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

describe('comment reply route', () => {
  let dir: string
  const saved = process.env.IRSIM_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-reply-route-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  const draft = () =>
    createComment({
      page: 'sales',
      board: 'Leads',
      file: 'design/Leads.dc.html',
      line: 1,
      element: { tag: 'td', path: 'td', text: '' },
      rect: { x: 0, y: 0, width: 1, height: 1 },
      body: 'Body',
    })

  it('answers 404 for an unknown comment', async () => {
    expect((await reply('c_missing', { author: 'user', body: 'x' })).status).toBe(404)
  })

  it('answers 409 when a user replies to a draft', async () => {
    const comment = await draft()
    const response = await reply(comment.id, { author: 'user', body: 'x' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'a draft is edited, not replied to' })
  })

  it('stores a user reply on a sent comment and reopens a resolved one', async () => {
    const comment = await draft()
    await sendDrafts({ sessionId: 's1' })
    await updateComment(comment.id, { status: 'resolved' })
    const response = await reply(comment.id, { author: 'user', body: 'Again' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'queued',
      replies: [{ author: 'user', body: 'Again', seen: false }],
    })
  })

  it('rejects bad reply images and stores good ones', async () => {
    const comment = await draft()
    await sendDrafts({ sessionId: 's1' })
    expect((await reply(comment.id, { author: 'user', body: 'x', images: 'nope' })).status).toBe(400)
    expect(
      (await reply(comment.id, { author: 'user', body: 'x', images: ['a', 'b', 'c', 'd', 'e'] }))
        .status,
    ).toBe(400)
    const saved = await saveImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
    if (!saved.ok) throw new Error('expected the image to be saved')
    const response = await reply(comment.id, { author: 'user', body: 'x', images: [saved.id] })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ replies: [{ images: [saved.id] }] })
  })

  it('rejects an unknown image id with 400', async () => {
    const comment = await draft()
    await sendDrafts({ sessionId: 's1' })
    const response = await reply(comment.id, { author: 'user', body: 'x', images: ['i_missing'] })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'unknown image' })
  })

  it('still accepts a claude reply and rejects a bad author', async () => {
    const comment = await draft()
    expect((await reply(comment.id, { author: 'claude', body: 'Done' })).status).toBe(200)
    expect((await reply(comment.id, { author: 'other', body: 'x' })).status).toBe(400)
  })
})
