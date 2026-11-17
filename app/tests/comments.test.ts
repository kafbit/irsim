import { describe, expect, it } from 'vitest'
import {
  boardsToReload,
  buildNote,
  chooseSession,
  groupComments,
  numberComments,
  parsePick,
  placePanel,
  sendLabel,
  toScreen,
} from '../src/canvas/comments/model'
import type { Comment, Session } from '../src/canvas/comments/types'
import { labelMaxInline } from '../src/canvas/geometry'
import { wheelView } from '../src/canvas/wheel'

const session = (id: string): Session => ({ id, label: id, cwd: '/', lastSeen: '' })
const comment = (id: string, status: Comment['status'], createdAt: string): Comment => ({
  id,
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 1,
  element: { tag: 'td', path: 'td', text: '' },
  rect: { x: 0, y: 0, width: 1, height: 1 },
  body: 'b',
  images: [],
  status,
  sessionId: null,
  batch: null,
  replies: [],
  createdAt,
})

describe('toScreen', () => {
  it('adds the frame position to the rect, then applies the camera', () => {
    const frame = { x: 100, y: 200, width: 1440, height: 900 }
    const rect = { x: 10, y: 20, width: 40, height: 30 }
    expect(toScreen(frame, rect, { x: 5, y: -10, k: 0.5 })).toEqual({
      x: 60,
      y: 100,
      width: 20,
      height: 15,
    })
  })
})

describe('placePanel', () => {
  const viewport = { width: 1000, height: 800 }
  const panel = { width: 320, height: 200 }

  it('opens below the rect, aligned to its start', () => {
    expect(placePanel({ x: 100, y: 100, width: 50, height: 20 }, viewport, panel)).toEqual({
      x: 100,
      y: 128,
    })
  })

  it('flips above when there is no room below', () => {
    expect(placePanel({ x: 100, y: 700, width: 50, height: 20 }, viewport, panel)).toEqual({
      x: 100,
      y: 492,
    })
  })

  it('stays inside the viewport at the end edge', () => {
    expect(placePanel({ x: 950, y: 100, width: 50, height: 20 }, viewport, panel).x).toBe(672)
  })
})

describe('chooseSession', () => {
  const live = [session('a'), session('b')]

  it('the URL session wins over a remembered one', () => {
    expect(chooseSession({ sessions: live, fromUrl: 'b', stored: 'a', picked: null })).toBe('b')
  })

  it('the URL session counts even when it is not listed', () => {
    expect(chooseSession({ sessions: [], fromUrl: 'x', stored: null, picked: null })).toBe('x')
  })

  it('a pick in this tab beats the URL while its session is live', () => {
    expect(chooseSession({ sessions: live, fromUrl: 'b', stored: 'b', picked: 'a' })).toBe('a')
    expect(chooseSession({ sessions: live, fromUrl: 'b', stored: 'b', picked: 'gone' })).toBe('b')
  })

  it('a remembered session is used only while it is live', () => {
    expect(chooseSession({ sessions: live, fromUrl: null, stored: 'a', picked: null })).toBe('a')
    expect(
      chooseSession({ sessions: live, fromUrl: null, stored: 'gone', picked: null }),
    ).toBeNull()
  })

  it('exactly one live session is picked, none or several are not', () => {
    expect(
      chooseSession({ sessions: [session('a')], fromUrl: null, stored: null, picked: null }),
    ).toBe('a')
    expect(chooseSession({ sessions: [], fromUrl: null, stored: null, picked: null })).toBeNull()
    expect(chooseSession({ sessions: live, fromUrl: null, stored: null, picked: null })).toBeNull()
  })
})

describe('parsePick', () => {
  const message = {
    type: 'pick',
    board: 'Table',
    details: {
      file: 'design/Table.dc.html',
      line: 142,
      element: { tag: 'td', path: 'tr > td', text: 'خالد' },
      rect: { x: 1, y: 2, width: 3, height: 4 },
    },
  }

  it('reads a complete pick', () => {
    expect(parsePick(message)).toEqual({ board: 'Table', ...message.details })
  })

  it('carries the scroll of a frame and omits a bad one', () => {
    const scroll = { x: 0, y: 1200 }
    expect(parsePick({ ...message, details: { ...message.details, scroll } })).toEqual({
      board: 'Table',
      ...message.details,
      scroll,
    })
    expect(parsePick(message)).not.toHaveProperty('scroll')
    for (const bad of [{ x: 1 }, { x: 'a', y: 2 }, null, 5]) {
      expect(parsePick({ ...message, details: { ...message.details, scroll: bad } })).not.toHaveProperty(
        'scroll',
      )
    }
  })

  it('rejects another type, a missing line or a bad rect', () => {
    expect(parsePick({ ...message, type: 'ready' })).toBeNull()
    expect(parsePick({ ...message, details: { ...message.details, line: 'x' } })).toBeNull()
    expect(parsePick({ ...message, details: { ...message.details, rect: { x: 1 } } })).toBeNull()
    expect(parsePick(null)).toBeNull()
  })

  it('accepts line 0 for a whole board and rejects a negative, fractional or NaN line', () => {
    const withLine = (line: number) => ({ ...message, details: { ...message.details, line } })
    expect(parsePick(withLine(0))).not.toBeNull()
    for (const line of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parsePick(withLine(line))).toBeNull()
    }
  })
})

describe('comment lists', () => {
  const list = [
    comment('c', 'delivered', '2026-11-08T10:03'),
    comment('b', 'resolved', '2026-11-08T10:02'),
    comment('a', 'draft', '2026-11-08T10:01'),
    comment('d', 'queued', '2026-11-08T10:04'),
  ]

  it('numbers by creation time, oldest first', () => {
    expect([...numberComments(list)]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])
  })

  it('groups queued and delivered as sent', () => {
    const groups = groupComments(list)
    expect(groups.draft.map((item) => item.id)).toEqual(['a'])
    expect(groups.sent.map((item) => item.id)).toEqual(['c', 'd'])
    expect(groups.resolved.map((item) => item.id)).toEqual(['b'])
  })

  it('the send label counts and pluralises', () => {
    expect(sendLabel(1)).toBe('Send 1 comment')
    expect(sendLabel(3)).toBe('Send 3 comments')
  })

  it('the Approve and build note names the comment and asks for the app change', () => {
    expect(buildNote({ id: 'c_1', body: 'Say Delete' })).toBe(
      'The user accepted the board change for comment c_1: "Say Delete". Implement it in the app.',
    )
  })
})

describe('boardsToReload', () => {
  const closures = new Map([
    ['Leads', ['Leads', 'Table']],
    ['Table', ['Table']],
    ['Home', ['Home']],
  ])

  it('a changed board reloads itself and every frame that imports it', () => {
    expect(boardsToReload(closures, 'Table')).toEqual(['Leads', 'Table'])
    expect(boardsToReload(closures, 'Home')).toEqual(['Home'])
    expect(boardsToReload(closures, 'Other')).toEqual([])
  })
})

describe('wheelView', () => {
  const view = { x: 0, y: 0, k: 1 }
  const input = { deltaX: 10, deltaY: 20, deltaMode: 0, ctrlKey: false, metaKey: false }

  it('pans against the delta, and line mode counts 16 px', () => {
    expect(wheelView(view, input, 0, 0)).toEqual({ x: -10, y: -20, k: 1 })
    expect(wheelView(view, { ...input, deltaMode: 1 }, 0, 0)).toEqual({ x: -160, y: -320, k: 1 })
  })

  it('Ctrl zooms around the pointer and keeps its world point fixed', () => {
    const next = wheelView(view, { ...input, deltaY: -100, ctrlKey: true }, 200, 100)
    expect(next.k).toBeGreaterThan(1)
    expect((200 - next.x) / next.k).toBeCloseTo(200)
    expect((100 - next.y) / next.k).toBeCloseTo(100)
  })

  it('a pinch of 100 * ln(2) in small steps doubles the zoom', () => {
    let next = view
    for (let i = 0; i < 10; i++) {
      next = wheelView(next, { ...input, deltaY: (-100 * Math.LN2) / 10, ctrlKey: true }, 0, 0)
    }
    expect(next.k).toBeCloseTo(2)
  })

  it('a mouse notch is clamped to one zoom step', () => {
    const notch = wheelView(view, { ...input, deltaY: -120, ctrlKey: true }, 0, 0)
    expect(notch.k).toBeCloseTo(Math.exp(0.24))
  })
})

describe('labelMaxInline', () => {
  it('is the frame screen width and falls to 0 under 24 px', () => {
    const css = labelMaxInline(1440)
    expect(css).toContain('100% * clamp')
    expect(css).toContain('var(--k, 1) * 1440 - 23')
  })
})
