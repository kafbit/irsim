import { describe, expect, it } from 'vitest'
import type { Comment } from '../src/lib/comments-types'
import { buildTurnText } from '../src/lib/turn-text'

const comment = (overrides: Partial<Comment>): Comment => ({
  id: 'c_1',
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 57,
  element: { tag: 'button', path: 'button', text: 'عميل جديد' },
  rect: { x: 0, y: 0, width: 1, height: 1 },
  body: 'Use the primary button.',
  status: 'delivered',
  sessionId: 's1',
  batch: 'b_1',
  replies: [],
  createdAt: '2026-11-08T10:00:00.000Z',
  ...overrides,
})

describe('buildTurnText', () => {
  it('matches the contract format', () => {
    const text = buildTurnText([
      comment({
        id: 'c_a',
        file: 'design/Table.dc.html',
        line: 142,
        element: { tag: 'span', path: 'td.bt-row > span', text: 'خالد الشهري' },
        body: 'Make the name column wider.',
      }),
      comment({ id: 'c_b' }),
    ])
    expect(text).toBe(
      [
        'Design canvas: 2 comments on page sales (batch b_1). Read only the lines named; boards live in design/.',
        '1. design/Table.dc.html:142 · td.bt-row > span "خالد الشهري" · on board Leads',
        '   Make the name column wider.',
        '2. design/Leads.dc.html:57 · button "عميل جديد"',
        '   Use the primary button.',
        'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
        'Ids: c_a, c_b',
      ].join('\n'),
    )
  })

  it('says comment for one and indents every line of a multi-line body', () => {
    const text = buildTurnText([comment({ body: 'First line\nSecond line' })])
    expect(text.split('\n')[0]).toStartWith('Design canvas: 1 comment on page sales')
    expect(text).toContain('\n   First line\n   Second line\n')
  })

  it('names every page and batch when they differ', () => {
    const text = buildTurnText([
      comment({ id: 'c_a', page: 'sales', batch: 'b_1' }),
      comment({ id: 'c_b', page: 'inventory', batch: 'b_2' }),
    ])
    expect(text.split('\n')[0]).toContain('on pages sales, inventory (batches b_1, b_2)')
  })
})
