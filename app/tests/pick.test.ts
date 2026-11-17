import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPicker } from '../public/runtime/pick.js'

class FakeStyle {
  declarations = new Map<string, string>()
  set cssText(text: string) {
    this.declarations = new Map()
    for (const part of text.split(';')) {
      const at = part.indexOf(':')
      if (at > 0) this.declarations.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
    }
  }
  set display(value: string) {
    this.declarations.set('display', value)
  }
  get(name: string) {
    return this.declarations.get(name)
  }
}

class FakeElement {
  style = new FakeStyle()
  constructor(
    public stamped = false,
    private box = { left: 10, top: 20, width: 100, height: 40, x: 10, y: 20 },
  ) {}
  getAttribute(name: string) {
    return name === 'data-dc-at' ? 'Table:142' : null
  }
  localName = 'td'
  classList: string[] = []
  parentElement = null
  textContent = 'Name'
  closest(selector: string) {
    return selector === '[data-dc-at]' && this.stamped ? this : null
  }
  getBoundingClientRect() {
    return this.box
  }
  remove() {}
}

type Handler = (event: unknown) => void

const setup = (
  ring: string | null | 'throws',
  origin = { left: 0, top: 0 },
  post: (type: string, details?: unknown) => void = vi.fn(),
) => {
  const handlers = new Map<string, Handler>()
  const made: FakeElement[] = []
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('scrollX', 0)
  vi.stubGlobal('scrollY', 0)
  const windowHandlers = new Map<string, Handler>()
  vi.stubGlobal('window', {
    addEventListener: (type: string, handler: Handler) => windowHandlers.set(type, handler),
    removeEventListener: (type: string) => windowHandlers.delete(type),
  })
  vi.stubGlobal('document', {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    createElement: () => {
      const node = new FakeElement(false, { ...origin, width: 0, height: 0, x: 0, y: 0 })
      made.push(node)
      return node
    },
    documentElement: { append: vi.fn() },
  })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ring ?? '' }))
  vi.stubGlobal('parent', {
    get document() {
      if (ring === 'throws') throw new Error('cross-origin')
      return { documentElement: {} }
    },
  })
  const picker = createPicker(post)
  picker.setOn(true)
  const hover = (target: FakeElement) => handlers.get('mousemove')?.({ target })
  const resize = () => windowHandlers.get('resize')?.({})
  const click = (target: FakeElement) =>
    handlers.get('click')?.({ target, preventDefault() {}, stopPropagation() {} })
  return { hover, click, resize, handlers, picker, outline: () => made[0] as FakeElement }
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

const HOVER = [
  'mouseover',
  'mouseout',
  'mouseenter',
  'mouseleave',
  'pointerover',
  'pointerout',
  'pointerenter',
  'pointerleave',
]

describe('comment mode hover outline', () => {
  it('stops the hover events from reaching the board and removes the handlers when off', () => {
    const { handlers, picker } = setup('#123456')
    for (const type of HOVER) {
      const handler = handlers.get(type)
      expect(handler).toBeDefined()
      const stopPropagation = vi.fn()
      const preventDefault = vi.fn()
      handler?.({ stopPropagation, preventDefault })
      expect(stopPropagation).toHaveBeenCalledTimes(1)
      expect(preventDefault).not.toHaveBeenCalled()
    }
    picker.setOn(false)
    for (const type of HOVER) expect(handlers.has(type)).toBe(false)
  })

  it('shows the outline over a stamped element, in the canvas ring colour', () => {
    const { hover, outline } = setup('#123456')
    hover(new FakeElement(true))
    const style = outline().style
    expect(style.get('display')).not.toBe('none')
    expect(style.get('outline')).toBe('2px solid #123456')
    expect(style.get('left')).toBe('10px')
    expect(style.get('width')).toBe('100px')
  })

  it('moves the outline back by the offset of the fixed layer, such as an RTL left scrollbar', () => {
    const { hover, outline } = setup('#123456', { left: 15, top: 0 })
    hover(new FakeElement(true))
    expect(outline().style.get('left')).toBe('-5px')
    expect(outline().style.get('top')).toBe('20px')
  })

  it('measures the origin of the fixed layer on every show', () => {
    const { hover, outline } = setup('#123456', { left: 15, top: 0 })
    const measure = vi.spyOn(outline(), 'getBoundingClientRect')
    hover(new FakeElement(true))
    hover(new FakeElement(true))
    hover(new FakeElement(true))
    expect(measure).toHaveBeenCalledTimes(3)
    expect(outline().style.get('left')).toBe('-5px')
  })

  it('measures the origin again when the scrollbar appears without a resize', () => {
    const { hover, outline } = setup('#123456')
    hover(new FakeElement(true))
    expect(outline().style.get('left')).toBe('10px')
    vi.spyOn(outline(), 'getBoundingClientRect').mockReturnValue({
      left: 15,
      top: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    } as DOMRect)
    hover(new FakeElement(true))
    expect(outline().style.get('left')).toBe('-5px')
  })

  it('hides the outline again over an element with no stamp', () => {
    const { hover, outline } = setup('#123456')
    hover(new FakeElement(true))
    hover(new FakeElement(false))
    expect(outline().style.get('display')).toBe('none')
  })

  it('falls back to the default ring when the canvas has none or is out of reach', () => {
    for (const ring of [null, 'throws'] as const) {
      const { hover, outline } = setup(ring)
      hover(new FakeElement(true))
      expect(outline().style.get('outline')).toBe('2px solid #14161a')
    }
  })
})

describe('comment mode click', () => {
  it('reports the rect and the scroll of the frame with the pick', () => {
    vi.stubGlobal('scrollX', 0)
    const post = vi.fn()
    const { click } = setup('#123456', { left: 0, top: 0 }, post)
    vi.stubGlobal('scrollX', 12.4)
    vi.stubGlobal('scrollY', 1199.6)
    click(new FakeElement(true))
    expect(post).toHaveBeenCalledWith(
      'pick',
      expect.objectContaining({
        file: 'design/Table.dc.html',
        line: 142,
        rect: { x: 22, y: 1220, width: 100, height: 40 },
        scroll: { x: 12, y: 1200 },
      }),
    )
  })
})
