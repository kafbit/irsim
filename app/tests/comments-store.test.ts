import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addReply,
  claim,
  createComment,
  deleteComment,
  listComments,
  listSessions,
  removeSession,
  sendDrafts,
  updateComment,
  upsertSession,
  type NewComment,
} from '../src/lib/comments-store'

const input = (overrides: Partial<NewComment> = {}): NewComment => ({
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 57,
  element: { tag: 'button', path: 'button', text: 'New' },
  rect: { x: 1, y: 2, width: 3, height: 4 },
  body: 'Use the primary button.',
  ...overrides,
})

describe('comments store', () => {
  let dir: string
  const saved = process.env.CANVAS_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-data-'))
    process.env.CANVAS_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.CANVAS_DATA_DIR
    else process.env.CANVAS_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('a new comment is a draft with a c_ id', async () => {
    const comment = await createComment(input())
    expect(comment.id).toMatch(/^c_[0-9a-z]{9,}$/)
    expect(comment).toMatchObject({ status: 'draft', sessionId: null, batch: null, replies: [] })
    const saved = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'))
    expect(saved).toHaveLength(1)
  })

  it('draft, send, claim moves a comment to delivered once', async () => {
    const first = await createComment(input())
    const second = await createComment(input({ page: 'other', body: 'Second' }))
    const sent = await sendDrafts({ sessionId: 's1' })
    expect(sent.count).toBe(2)
    expect(sent.batch).toMatch(/^b_/)
    expect((await listComments({ status: 'queued', session: 's1' })).map((c) => c.id)).toEqual([
      second.id,
      first.id,
    ])
    const claimed = await claim('s1')
    expect(claimed.count).toBe(2)
    expect(claimed.batch).toBe(sent.batch)
    expect(claimed.comments.map((c) => c.status)).toEqual(['delivered', 'delivered'])
    expect(claimed.text).toContain('Ids: ')
    expect((await claim('s1')).count).toBe(0)
  })

  it('send takes only the drafts of the given page and sends nothing when there are none', async () => {
    await createComment(input())
    await createComment(input({ page: 'other' }))
    expect((await sendDrafts({ sessionId: 's1', page: 'sales' })).count).toBe(1)
    expect((await listComments({ status: 'draft' })).map((c) => c.page)).toEqual(['other'])
    expect(await sendDrafts({ sessionId: 's1', page: 'missing' })).toEqual({
      batch: null,
      count: 0,
    })
  })

  it('claim only takes the comments queued for that session', async () => {
    await createComment(input())
    await sendDrafts({ sessionId: 's1' })
    expect((await claim('s2')).count).toBe(0)
    expect((await claim('s1')).count).toBe(1)
  })

  it('two sessions each claim only the comments they sent, and never twice', async () => {
    await createComment(input({ page: 'sales', body: 'for one' }))
    await sendDrafts({ sessionId: 's1', page: 'sales' })
    await createComment(input({ page: 'sales', body: 'for two' }))
    await sendDrafts({ sessionId: 's2', page: 'sales' })
    const one = await claim('s1')
    const two = await claim('s2')
    expect(one.comments.map((comment) => comment.body)).toEqual(['for one'])
    expect(two.comments.map((comment) => comment.body)).toEqual(['for two'])
    expect((await claim('s1')).count).toBe(0)
    expect((await claim('s2')).count).toBe(0)
  })

  it('a data directory of another worktree never sees these comments', async () => {
    await createComment(input())
    await sendDrafts({ sessionId: 's1' })
    const other = mkdtempSync(join(tmpdir(), 'canvas-data-other-'))
    const here = process.env.CANVAS_DATA_DIR
    process.env.CANVAS_DATA_DIR = other
    try {
      expect(await listComments({})).toEqual([])
      expect((await claim('s1')).count).toBe(0)
    } finally {
      process.env.CANVAS_DATA_DIR = here
      rmSync(other, { recursive: true, force: true })
    }
    expect((await claim('s1')).count).toBe(1)
  })

  it('only a draft can be edited or deleted, a resolve works on any status', async () => {
    const comment = await createComment(input())
    expect(await updateComment(comment.id, { body: 'Edited' })).toMatchObject({
      ok: true,
      value: { body: 'Edited' },
    })
    await sendDrafts({ sessionId: 's1' })
    expect(await updateComment(comment.id, { body: 'Late' })).toEqual({
      ok: false,
      reason: 'not_draft',
    })
    expect(await deleteComment(comment.id)).toEqual({ ok: false, reason: 'not_draft' })
    expect(await updateComment(comment.id, { status: 'resolved' })).toMatchObject({
      ok: true,
      value: { status: 'resolved' },
    })
    expect(await updateComment('c_missing', { status: 'resolved' })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('a draft can be deleted', async () => {
    const comment = await createComment(input())
    expect(await deleteComment(comment.id)).toEqual({ ok: true, value: comment.id })
    expect(await listComments()).toEqual([])
  })

  it('a reply is appended with its author and time', async () => {
    const comment = await createComment(input())
    const result = await addReply(
      comment.id,
      { author: 'claude', body: 'Done' },
      Date.parse('2026-11-08T10:00:00Z'),
    )
    expect(result).toMatchObject({
      ok: true,
      value: { replies: [{ author: 'claude', body: 'Done', at: '2026-11-08T10:00:00.000Z' }] },
    })
    expect(await addReply('c_missing', { author: 'user', body: 'x' })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('list filters by status, page and board', async () => {
    await createComment(input())
    await createComment(input({ page: 'other', board: 'Table' }))
    expect(await listComments({ page: 'other' })).toHaveLength(1)
    expect(await listComments({ board: 'Leads' })).toHaveLength(1)
    expect(await listComments({ status: 'queued' })).toHaveLength(0)
  })

  it('writes made at the same time are all kept', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => createComment(input({ line: index }))),
    )
    expect(await listComments()).toHaveLength(12)
  })

  it('a session is live for 30 seconds after its last sighting', async () => {
    const t0 = Date.parse('2026-11-08T10:00:00Z')
    await upsertSession({ id: 'a', label: 'A', cwd: '/a' }, t0)
    await upsertSession({ id: 'b', label: 'B', cwd: '/b' }, t0 + 10_000)
    expect((await listSessions(t0 + 20_000)).map((s) => s.id)).toEqual(['b', 'a'])
    expect((await listSessions(t0 + 30_000)).map((s) => s.id)).toEqual(['b'])
    expect(await listSessions(t0 + 40_000)).toEqual([])
  })

  it('claim refreshes the session and registers an unknown one', async () => {
    await claim('cli')
    expect((await listSessions()).map((s) => s.id)).toEqual(['cli'])
    expect(await removeSession('cli')).toBe(true)
    expect(await removeSession('cli')).toBe(false)
  })
})
