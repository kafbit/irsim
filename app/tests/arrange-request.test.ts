import { describe, expect, test } from 'bun:test'
import { arrangeRequest, DEFAULT_GAP, gridDefaults } from '../src/canvas/tidy-section'

const fields = { gap: '', columns: '', rows: '', width: '' }

describe('arrange request', () => {
  test('row falls back to the default gap and clamps', () => {
    expect(arrangeRequest('row', fields, 4)).toEqual({ mode: 'row', gap: DEFAULT_GAP })
    expect(arrangeRequest('row', { ...fields, gap: '9999' }, 4).gap).toBe(400)
    expect(arrangeRequest('row', { ...fields, gap: '-5' }, 4).gap).toBe(0)
  })

  test('grid takes columns and rows within the board count', () => {
    expect(gridDefaults(7)).toEqual({ columns: 3, rows: 3 })
    expect(arrangeRequest('grid', { ...fields, gap: '8', columns: '2', rows: '4' }, 7)).toEqual({
      mode: 'grid',
      gap: 8,
      columns: 2,
      rows: 4,
    })
    expect(arrangeRequest('grid', { ...fields, columns: '50' }, 7).columns).toBe(7)
    expect(arrangeRequest('grid', fields, 7)).toMatchObject({ columns: 3, rows: 3 })
  })

  test('wrap carries a width', () => {
    expect(arrangeRequest('wrap', { ...fields, width: '900' }, 4).width).toBe(900)
    expect(arrangeRequest('wrap', fields, 4).width).toBe(1200)
  })
})
