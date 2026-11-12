import { describe, expect, it } from 'vitest'
import { parseNewComment } from '../src/lib/comments-input'

const body = {
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 57,
  element: { tag: 'button', path: 'button', text: 'New' },
  rect: { x: 1, y: 2, width: 3, height: 4 },
  body: 'Use the primary button.',
}

describe('parseNewComment line', () => {
  it('accepts an integer line, including 0 for a whole board', () => {
    expect(parseNewComment(body)).toMatchObject({ line: 57 })
    expect(parseNewComment({ ...body, line: 0 })).toMatchObject({ line: 0 })
  })

  it('rejects a negative, fractional, NaN or non-number line', () => {
    for (const line of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) {
      expect(parseNewComment({ ...body, line })).toBe('line must be an integer of 0 or more')
    }
  })
})
