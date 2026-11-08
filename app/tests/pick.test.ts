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
  closest(selector: string) {
    return selector === '[data-dc-at]' && this.stamped ? this : null
  }
  getBoundingClientRect() {
    return this.box
  }
  remove() {}
}

type Handler = (event: unknown) => void

const setup = (ring: string | null | 'throws') => {
  const handlers = new Map<string, Handler>()
  const made: FakeElement[] = []
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('scrollX', 0)
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    createElement: () => {
      const node = new FakeElement()
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
  const picker = createPicker(vi.fn())
  picker.setOn(true)
  const hover = (target: FakeElement) => handlers.get('mousemove')?.({ target })
  return { hover, outline: () => made[0] as FakeElement }
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('comment mode hover outline', () => {
  it('shows the outline over a stamped element, in the canvas ring colour', () => {
    const { hover, outline } = setup('#123456')
    hover(new FakeElement(true))
    const style = outline().style
    expect(style.get('display')).not.toBe('none')
    expect(style.get('outline')).toBe('2px solid #123456')
    expect(style.get('left')).toBe('10px')
    expect(style.get('width')).toBe('100px')
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
