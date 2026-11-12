import { describe, expect, it } from 'vitest'
import { hasRoom, wheelScrolls } from '../public/runtime/scroll.js'

type Box = {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
  parentElement: Box | null
  style: { overflowX: string; overflowY: string; direction: string }
}

const box = (over: Partial<Box> = {}, style: Partial<Box['style']> = {}): Box => ({
  scrollTop: 0,
  scrollLeft: 0,
  scrollHeight: 100,
  scrollWidth: 100,
  clientHeight: 100,
  clientWidth: 100,
  parentElement: null,
  ...over,
  style: { overflowX: 'visible', overflowY: 'visible', direction: 'ltr', ...style },
})

const styleOf = (node: Box) => node.style

describe('hasRoom', () => {
  it('has no room when the content fits', () => {
    expect(hasRoom(0, 100, 100, 10, false)).toBe(false)
  })

  it('has room down from the top, and not up', () => {
    expect(hasRoom(0, 300, 100, 10, false)).toBe(true)
    expect(hasRoom(0, 300, 100, -10, false)).toBe(false)
  })

  it('has no room down at the bottom', () => {
    expect(hasRoom(200, 300, 100, 10, false)).toBe(false)
    expect(hasRoom(200, 300, 100, -10, false)).toBe(true)
  })

  it('in RTL starts at 0 on the right and moves left into negative positions', () => {
    expect(hasRoom(0, 300, 100, 10, true)).toBe(false)
    expect(hasRoom(0, 300, 100, -10, true)).toBe(true)
    expect(hasRoom(-200, 300, 100, -10, true)).toBe(false)
    expect(hasRoom(-200, 300, 100, 10, true)).toBe(true)
  })
})

describe('wheelScrolls', () => {
  it('is false for a board drawn at full height, so the canvas pans', () => {
    const root = box({ scrollHeight: 4600, clientHeight: 4600 })
    const target = box({ parentElement: root })
    expect(wheelScrolls(target, root, 0, 40, styleOf)).toBe(false)
  })

  it('is true when the page itself scrolls', () => {
    const root = box({ scrollHeight: 2000, clientHeight: 900 })
    expect(wheelScrolls(box({ parentElement: root }), root, 0, 40, styleOf)).toBe(true)
  })

  it('is false when the page overflow is hidden', () => {
    const root = box({ scrollHeight: 2000, clientHeight: 900 }, { overflowY: 'hidden' })
    expect(wheelScrolls(box({ parentElement: root }), root, 0, 40, styleOf)).toBe(false)
  })

  it('is true inside a scrolling list with room, and false at its end', () => {
    const root = box()
    const list = box({ parentElement: root, scrollHeight: 500 }, { overflowY: 'auto' })
    const item = box({ parentElement: list })
    expect(wheelScrolls(item, root, 0, 40, styleOf)).toBe(true)
    list.scrollTop = 400
    expect(wheelScrolls(item, root, 0, 40, styleOf)).toBe(false)
  })

  it('ignores an element that overflows without a scrolling overflow', () => {
    const root = box()
    const clipped = box({ parentElement: root, scrollHeight: 500 })
    expect(wheelScrolls(box({ parentElement: clipped }), root, 0, 40, styleOf)).toBe(false)
  })

  it('uses the dominant axis', () => {
    const root = box()
    const row = box({ parentElement: root, scrollWidth: 500 }, { overflowX: 'auto' })
    expect(wheelScrolls(row, root, 40, 5, styleOf)).toBe(true)
    expect(wheelScrolls(row, root, 5, 40, styleOf)).toBe(false)
  })
})
