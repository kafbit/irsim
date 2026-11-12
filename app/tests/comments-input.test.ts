import { describe, expect, it } from 'vitest'
import { parseNewComment } from '../src/lib/comments-input'

const body = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 57,
  element: { tag: 'button', path: 'button', text: 'New' },
  rect: { x: 1, y: 2, width: 3, height: 4 },
  body: 'Use the primary button.',
  ...extra,
})

const VIEW_ERROR = 'view must hold width, height, preset, scrollX and scrollY'
const goodView = { width: 390, height: 844, preset: 'phone', scrollX: 0, scrollY: 1200 }

describe('parseNewComment view', () => {
  it('leaves view out when it is absent', () => {
    const parsed = parseNewComment(body())
    expect(typeof parsed).toBe('object')
    expect(parsed).not.toHaveProperty('view')
    expect(parseNewComment(body({ view: undefined }))).not.toHaveProperty('view')
  })

  it('keeps a valid view and rounds its numbers', () => {
    expect(parseNewComment(body({ view: goodView }))).toMatchObject({ view: goodView })
    expect(
      parseNewComment(
        body({ view: { width: 389.6, height: 843.5, preset: 'fit', scrollX: 0.4, scrollY: 9.5 } }),
      ),
    ).toMatchObject({ view: { width: 390, height: 844, preset: 'fit', scrollX: 0, scrollY: 10 } })
  })

  it('rejects a view that is not a record or lacks a field', () => {
    for (const view of [null, 'phone', [], {}, { ...goodView, preset: undefined }]) {
      expect(parseNewComment(body({ view }))).toBe(VIEW_ERROR)
    }
  })

  it('rejects non-positive sizes, negative scrolls and non-finite numbers', () => {
    for (const patch of [
      { width: 0 },
      { height: -1 },
      { scrollX: -1 },
      { scrollY: -0.6 },
      { width: Number.NaN },
      { width: '390' },
      { scrollY: null },
    ]) {
      expect(parseNewComment(body({ view: { ...goodView, ...patch } }))).toBe(VIEW_ERROR)
    }
  })

  it('rejects an empty or over-long preset', () => {
    expect(parseNewComment(body({ view: { ...goodView, preset: '' } }))).toBe(VIEW_ERROR)
    expect(parseNewComment(body({ view: { ...goodView, preset: 'x'.repeat(33) } }))).toBe(
      VIEW_ERROR,
    )
    expect(parseNewComment(body({ view: { ...goodView, preset: 'x'.repeat(32) } }))).toMatchObject({
      view: { preset: 'x'.repeat(32) },
    })
  })
})

describe('parseNewComment line', () => {
  it('accepts an integer line, including 0 for a whole board', () => {
    expect(parseNewComment(body())).toMatchObject({ line: 57 })
    expect(parseNewComment(body({ line: 0 }))).toMatchObject({ line: 0 })
  })

  it('rejects a negative, fractional, NaN or non-number line', () => {
    for (const line of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) {
      expect(parseNewComment(body({ line }))).toBe('line must be an integer of 0 or more')
    }
  })
})
