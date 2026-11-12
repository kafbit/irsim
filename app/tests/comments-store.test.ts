import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { imagePath, saveImage } from '../src/lib/comment-images'
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
  whenWritesIdle,
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
  const saved = process.env.IRSIM_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-data-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('a new comment is a draft with a c_ id', async () => {
    const comment = await createComment(input())
    expect(comment.id).toMatch(/^c_[0-9a-z]{9,}$/)
    expect(comment).toMatchObject({ status: 'draft', sessionId: null, batch: null, replies: [] })
    const saved = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'))
    expect(saved).toHaveLength(1)
  })

  it('stores the view on the comment and leaves the key out when there is none', async () => {
    const view = { width: 390, height: 844, preset: 'phone', scrollX: 0, scrollY: 1200 }
    const withView = await createComment(input({ view }))
    const without = await createComment(input({ view: undefined }))
    expect(withView.view).toEqual(view)
    expect(without).not.toHaveProperty('view')
    const saved = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'))
    expect(saved[0].view).toEqual(view)
    expect('view' in saved[1]).toBe(false)
    expect((await listComments({ status: 'draft' })).map((c) => c.view)).toEqual([undefined, view])
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
    const here = process.env.IRSIM_DATA_DIR
    process.env.IRSIM_DATA_DIR = other
    try {
      expect(await listComments({})).toEqual([])
      expect((await claim('s1')).count).toBe(0)
    } finally {
      process.env.IRSIM_DATA_DIR = here
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
      value: {
        replies: [{ author: 'claude', body: 'Done', at: '2026-11-08T10:00:00.000Z', seen: true }],
      },
    })
    expect(await addReply('c_missing', { author: 'user', body: 'x' })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  describe('replies from the user', () => {
    const sent = async (sessionId = 's1') => {
      const comment = await createComment(input())
      await sendDrafts({ sessionId })
      return comment
    }

    it('a user reply on a queued or delivered comment queues it again, unseen, keeping the session', async () => {
      const comment = await sent()
      const queued = await addReply(comment.id, { author: 'user', body: 'More' })
      expect(queued).toMatchObject({
        ok: true,
        value: { status: 'queued', sessionId: 's1', replies: [{ author: 'user', seen: false }] },
      })
      const batch = queued.ok ? queued.value.batch : null
      await claim('s1')
      const again = await addReply(comment.id, { author: 'user', body: 'Again' })
      expect(again).toMatchObject({ ok: true, value: { status: 'queued', sessionId: 's1', batch } })
    })

    it('a user reply reopens a resolved comment', async () => {
      const comment = await sent()
      await updateComment(comment.id, { status: 'resolved' })
      const result = await addReply(comment.id, { author: 'user', body: 'Not fixed' })
      expect(result).toMatchObject({ ok: true, value: { status: 'queued', reopened: true } })
    })

    it('a user reply on a draft is refused', async () => {
      const comment = await createComment(input())
      expect(await addReply(comment.id, { author: 'user', body: 'x' })).toEqual({
        ok: false,
        reason: 'is_draft',
      })
    })

    it('a user reply on a comment with no session is refused', async () => {
      const comment = await sent()
      const stored = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'))
      stored[0].sessionId = null
      writeFileSync(join(dir, 'comments.json'), JSON.stringify(stored))
      expect(await addReply(comment.id, { author: 'user', body: 'x' })).toEqual({
        ok: false,
        reason: 'no_session',
      })
    })

    it('a claude reply leaves the status as it was', async () => {
      const comment = await sent()
      await claim('s1')
      const result = await addReply(comment.id, { author: 'claude', body: 'Done' })
      expect(result).toMatchObject({ ok: true, value: { status: 'delivered' } })
    })

    it('a stored reply with no seen field reads as seen', async () => {
      const comment = await sent()
      const stored = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'))
      stored[0].replies = [{ author: 'user', body: 'Old', at: '2026-11-08T10:00:00.000Z' }]
      writeFileSync(join(dir, 'comments.json'), JSON.stringify(stored))
      expect((await listComments())[0]?.replies[0]?.seen).toBe(true)
      expect(comment.id).toBe((await listComments())[0]?.id)
    })

    it('claim delivers a follow-up once, marks its replies seen and delivers it', async () => {
      const comment = await sent()
      await claim('s1')
      await addReply(comment.id, { author: 'user', body: 'One more thing' })
      const claimed = await claim('s1')
      expect(claimed.count).toBe(1)
      expect(claimed.comments[0]).toMatchObject({
        followUp: true,
        status: 'delivered',
        newReplies: [{ body: 'One more thing' }],
      })
      expect(claimed.text).toContain('· follow-up')
      expect(claimed.text).toContain('   NEW You: One more thing')
      expect((await listComments())[0]?.replies.every((reply) => reply.seen)).toBe(true)
      expect((await claim('s1')).count).toBe(0)
    })

    it('claim returns a fresh comment and a follow-up together', async () => {
      const first = await sent()
      await claim('s1')
      await addReply(first.id, { author: 'user', body: 'Follow' })
      await createComment(input({ body: 'Fresh one' }))
      await sendDrafts({ sessionId: 's1' })
      const claimed = await claim('s1')
      expect(claimed.comments.map((c) => [c.body, c.followUp])).toEqual([
        ['Use the primary button.', true],
        ['Fresh one', false],
      ])
      expect(claimed.comments[1]?.newReplies).toEqual([])
      expect(claimed.text).toContain('2 comments (1 new, 1 follow-up)')
    })

    it('a reopened comment is delivered with the resolved note, once', async () => {
      const comment = await sent()
      await claim('s1')
      await updateComment(comment.id, { status: 'resolved' })
      await addReply(comment.id, { author: 'user', body: 'Still wrong' })
      const claimed = await claim('s1')
      expect(claimed.text).toContain('· follow-up (was resolved, resolve it again')
      await addReply(comment.id, { author: 'user', body: 'And again' })
      expect((await claim('s1')).text).not.toContain('was resolved')
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

  describe('images', () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const stored = async (): Promise<string> => {
      const saved = await saveImage(PNG)
      if (!saved.ok) throw new Error('expected the image to be saved')
      return saved.id
    }

    it('create keeps the image ids, and a comment without any reads as []', async () => {
      const id = await stored()
      expect((await createComment(input({ images: [id] }))).images).toEqual([id])
      expect((await createComment(input())).images).toEqual([])
    })

    it('a stored comment with no images field reads as []', async () => {
      const comment = await createComment(input())
      const { images: _images, ...old } = comment
      writeFileSync(join(dir, 'comments.json'), JSON.stringify([old]))
      expect((await listComments())[0]?.images).toEqual([])
      const updated = await updateComment(comment.id, { body: 'Edited' })
      expect(updated.ok && updated.value.images).toEqual([])
    })

    it('patch replaces the images of a draft and deletes the dropped files', async () => {
      const one = await stored()
      const two = await stored()
      const comment = await createComment(input({ images: [one, two] }))
      const result = await updateComment(comment.id, { images: [two] })
      expect(result.ok && result.value.images).toEqual([two])
      expect(await imagePath(one)).toBeNull()
      expect(await imagePath(two)).not.toBeNull()
    })

    it('patch of images on a queued comment is not_draft and keeps the files', async () => {
      const id = await stored()
      const comment = await createComment(input({ images: [id] }))
      await sendDrafts({ sessionId: 's1' })
      expect(await updateComment(comment.id, { images: [] })).toEqual({
        ok: false,
        reason: 'not_draft',
      })
      expect(await imagePath(id)).not.toBeNull()
    })

    it('deleteComment removes the image files', async () => {
      const id = await stored()
      const comment = await createComment(input({ images: [id] }))
      expect((await deleteComment(comment.id)).ok).toBe(true)
      expect(await imagePath(id)).toBeNull()
    })

    it('claim returns the absolute image paths in the text and per comment', async () => {
      const id = await stored()
      await createComment(input({ images: [id] }))
      await sendDrafts({ sessionId: 's1' })
      const claimed = await claim('s1')
      const path = await imagePath(id)
      expect(claimed.comments[0]?.imagePaths).toEqual([path])
      expect(claimed.text).toContain(`   image: ${path}`)
    })
  })

  describe('whenWritesIdle', () => {
    it('resolves once the queued writes finish', async () => {
      const pending = createComment(input())
      await whenWritesIdle(5000)
      expect((await listComments()).length).toBe(1)
      await pending
    })

    it('resolves at once when nothing is queued', async () => {
      await whenWritesIdle(5000)
    })
  })
})
