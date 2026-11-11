import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET, POST } from '../src/app/api/approvals/route'
import { closureOf } from '../src/lib/closure'
import {
  claim,
  createApproval,
  createComment,
  listApprovals,
  sendDrafts,
  upsertSession,
} from '../src/lib/comments-store'
import type { Approval } from '../src/lib/comments-types'
import { buildApprovalText } from '../src/lib/turn-text'

const approval = (overrides: Partial<Approval> = {}): Approval => ({
  id: 'a_1',
  page: 'sales',
  board: 'Leads',
  hash: 'h',
  note: '',
  sessionId: 's1',
  status: 'queued',
  createdAt: '2026-11-12T00:00:00.000Z',
  ...overrides,
})

describe('buildApprovalText', () => {
  it('says the approval is the confirmation and to read the board again', () => {
    expect(buildApprovalText([approval({ note: 'Keep the old filter.' })], { a_1: true })).toBe(
      [
        'Design canvas: the user approved board Leads (page sales). This is the confirmation to build it.',
        '   Keep the old filter.',
        '   Read design/Leads.dc.html again first, because the user may have edited it, then build the app from it and compare the board and the screen with screenshots.',
      ].join('\n'),
    )
  })

  it('asks for a new approval when the board changed after it', () => {
    expect(buildApprovalText([approval()], { a_1: false }, 'boards')).toContain(
      'The board changed after the approval. Ask the user to approve it again before you build.',
    )
  })
})

describe('approvals', () => {
  let root: string
  let design: string
  const saved = { data: process.env.IRSIM_DATA_DIR, design: process.env.IRSIM_DESIGN_DIR }

  /** A new mtime and size, so the closure cache sees the edit. */
  const editBoard = (source: string) => {
    const file = join(design, 'Leads.dc.html')
    writeFileSync(file, source)
    const later = new Date(Date.now() + 5000)
    utimesSync(file, later, later)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'approvals-'))
    design = join(root, 'design')
    mkdirSync(design)
    writeFileSync(join(design, 'Leads.dc.html'), '<x-dc>leads</x-dc>')
    writeFileSync(join(design, 'Other.dc.html'), '<x-dc>other</x-dc>')
    writeFileSync(
      join(design, 'canvas.json'),
      JSON.stringify({
        pages: [
          { id: 'sales', title: 'Sales', boards: [{ name: 'Leads', title: 'Leads', x: 0, y: 0, width: 10, height: 10 }] },
        ],
      }),
    )
    process.env.IRSIM_DATA_DIR = join(root, 'data')
    process.env.IRSIM_DESIGN_DIR = design
  })

  const live = (id = 's1') => upsertSession({ id, label: id, cwd: '/w' })
  const approve = async (sessionId = 's1') => {
    await live(sessionId)
    const hash = (await closureOf('Leads')).content
    return createApproval({ page: 'sales', board: 'Leads', note: '', sessionId, hash })
  }

  afterEach(() => {
    for (const [key, value] of [
      ['IRSIM_DATA_DIR', saved.data],
      ['IRSIM_DESIGN_DIR', saved.design],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('a claim delivers an approval once, before the comments of the same claim', async () => {
    await approve()
    await createComment({
      page: 'sales',
      board: 'Leads',
      file: 'design/Leads.dc.html',
      line: 1,
      element: { tag: 'div', path: 'div', text: 'x' },
      rect: { x: 0, y: 0, width: 1, height: 1 },
      body: 'Bigger.',
    })
    await sendDrafts({ sessionId: 's1' })

    const first = await claim('s1')
    expect(first.count).toBe(2)
    expect(first.approvals.map((a) => a.board)).toEqual(['Leads'])
    expect(first.text.indexOf('approved board Leads')).toBeLessThan(first.text.indexOf('Bigger.'))

    const second = await claim('s1')
    expect(second).toMatchObject({ count: 0, text: '', approvals: [] })
  })

  it('an approval goes only to its session', async () => {
    await approve()
    expect((await claim('s2')).count).toBe(0)
    expect((await claim('s1')).count).toBe(1)
  })

  it('a board edit after the approval turns it to changed, and the claim says so', async () => {
    await approve()
    expect((await listApprovals(['Leads'])).approvals).toMatchObject([
      { board: 'Leads', current: true, status: 'queued' },
    ])
    editBoard('<x-dc>leads, edited</x-dc>')
    expect((await listApprovals(['Leads'])).approvals).toMatchObject([
      { board: 'Leads', current: false },
    ])
    expect((await claim('s1')).text).toContain('The board changed after the approval')
    expect((await listApprovals(['Leads'])).approvals[0]?.status).toBe('delivered')
  })

  it('a touch or a save with the same content keeps the approval current', async () => {
    await approve()
    editBoard('<x-dc>leads</x-dc>')
    expect((await listApprovals(['Leads'])).approvals[0]?.current).toBe(true)
  })

  it('refuses a board that changed since the user looked, and a session that is not live', async () => {
    const seen = (await closureOf('Leads')).content
    await live()
    editBoard('<x-dc>leads, edited by Claude</x-dc>')
    expect(
      await createApproval({ page: 'sales', board: 'Leads', note: '', sessionId: 's1', hash: seen }),
    ).toBe('stale')
    const now = (await closureOf('Leads')).content
    expect(
      await createApproval({ page: 'sales', board: 'Leads', note: '', sessionId: 'gone', hash: now }),
    ).toBe('no_session')
  })

  it('an approval shows on every page that has the board', async () => {
    await approve()
    expect((await listApprovals(['Leads', 'Other'])).approvals.map((a) => a.board)).toEqual([
      'Leads',
    ])
  })

  it('a failed claim leaves the approval queued', async () => {
    await approve()
    writeFileSync(join(process.env.IRSIM_DATA_DIR as string, 'comments.json'), '{ broken')
    await expect(claim('s1')).rejects.toThrow()
    writeFileSync(join(process.env.IRSIM_DATA_DIR as string, 'comments.json'), '[]')
    expect((await claim('s1')).approvals.map((a) => a.board)).toEqual(['Leads'])
  })

  it('the route checks its input and lists the latest approval per board', async () => {
    const post = (body: unknown) =>
      POST(new Request('http://x/api/approvals', { method: 'POST', body: JSON.stringify(body) }))
    expect((await post({ page: 'sales', board: 'Leads' })).status).toBe(400)
    expect((await post({ page: 'sales', board: 'Nope', sessionId: 's1', hash: 'x' })).status).toBe(404)
    expect((await post({ page: 'sales', board: 'Other', sessionId: 's1', hash: 'x' })).status).toBe(404)
    expect((await post({ page: 'sales', board: 'Leads', sessionId: 's1' })).status).toBe(400)
    const hash = (await closureOf('Leads')).content
    expect(
      (await post({ page: 'sales', board: 'Leads', sessionId: 's1', hash, note: 'x'.repeat(2001) }))
        .status,
    ).toBe(400)
    expect((await post({ page: 'sales', board: 'Leads', sessionId: 's1', hash })).status).toBe(409)
    await live()
    expect((await post({ page: 'sales', board: 'Leads', sessionId: 's1', hash: 'old' })).status).toBe(409)
    const created = await post({ page: 'sales', board: 'Leads', sessionId: 's1', hash, note: ' Go. ' })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ board: 'Leads', note: 'Go.', status: 'queued' })

    expect((await GET(new Request('http://x/api/approvals'))).status).toBe(400)
    expect((await GET(new Request('http://x/api/approvals?page=nope'))).status).toBe(404)
    const list = await GET(new Request('http://x/api/approvals?page=sales'))
    expect(await list.json()).toMatchObject({
      hashes: { Leads: hash },
      approvals: [{ board: 'Leads', current: true }],
    })
  })
})
