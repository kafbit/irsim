import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as claimRoute } from '../src/app/api/comments/claim/route'
import { POST } from '../src/app/api/comments/release/route'
import { createComment, sendDrafts, upsertSession } from '../src/lib/comments-store'

const post = (handler: typeof POST, body: unknown) =>
  handler(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }))

const release = (body: unknown) => post(POST, body)
const claim = async (sessionId: string) =>
  (await post(claimRoute, { sessionId })).json() as Promise<{ count: number; comments: { id: string }[] }>

describe('comment release route', () => {
  let dir: string
  const saved = process.env.IRSIM_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-release-route-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers 400 for a missing or non-text sessionId', async () => {
    expect((await release({})).status).toBe(400)
    expect((await release({ sessionId: 5 })).status).toBe(400)
    expect((await release({ sessionId: '' })).status).toBe(400)
  })

  it('answers 400 for malformed lists', async () => {
    expect((await release({ sessionId: 's1', comments: 'c_1' })).status).toBe(400)
    expect((await release({ sessionId: 's1', approvals: [1] })).status).toBe(400)
    expect((await release({ sessionId: 's1', variants: {} })).status).toBe(400)
    expect((await release({ sessionId: 's1', replies: ['x'] })).status).toBe(400)
    expect((await release({ sessionId: 's1', replies: [{ comment: 'c_1' }] })).status).toBe(400)
  })

  it('accepts a body with only a sessionId', async () => {
    const response = await release({ sessionId: 's1' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('makes a claimed comment claimable again', async () => {
    await upsertSession({ id: 's1', label: 's', cwd: '/s' })
    const comment = await createComment({
      page: 'sales',
      board: 'Leads',
      file: 'design/Leads.dc.html',
      line: 1,
      element: { tag: 'td', path: 'td', text: '' },
      rect: { x: 0, y: 0, width: 1, height: 1 },
      body: 'Body',
    })
    await sendDrafts({ sessionId: 's1' })

    const first = await claim('s1')
    expect(first.comments.map((one) => one.id)).toEqual([comment.id])
    expect((await claim('s1')).count).toBe(0)

    const response = await release({ sessionId: 's1', comments: [comment.id] })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    const again = await claim('s1')
    expect(again.comments.map((one) => one.id)).toEqual([comment.id])
  })
})
