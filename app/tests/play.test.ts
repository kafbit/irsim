import { describe, expect, it } from 'vitest'
import { boardOfHref, isExternalHref } from '../public/runtime/links.js'
import { playScale } from '../src/canvas/play-view'
import { linkProblem, playHref } from '../src/canvas/use-play-links'
import { isInteractive, looksInteractive } from '../src/lib/interactive'
import { fillsWindow, hasFluidRoot, rootStyleOf } from '../src/lib/page-fill'

describe('boardOfHref', () => {
  it('reads the board from a relative, nested or rooted link', () => {
    expect(boardOfHref('Cart.dc.html')).toBe('Cart')
    expect(boardOfHref('./Cart.dc.html')).toBe('Cart')
    expect(boardOfHref('/sub/Cart.dc.html')).toBe('Cart')
    expect(boardOfHref(' Cart.dc.html#top ')).toBe('Cart')
    expect(boardOfHref('Cart.dc.html?x=1')).toBe('Cart')
  })

  it('ignores other links', () => {
    expect(boardOfHref('#section')).toBeNull()
    expect(boardOfHref('https://example.com')).toBeNull()
    expect(boardOfHref('Cart.html')).toBeNull()
    expect(boardOfHref('1Cart.dc.html')).toBeNull()
  })

  it('never reads a board from another site', () => {
    expect(boardOfHref('https://other.com/docs/Cart.dc.html')).toBeNull()
    expect(boardOfHref('//other.com/Cart.dc.html')).toBeNull()
    expect(isExternalHref('https://other.com/docs/Cart.dc.html')).toBe(true)
  })
})

describe('isExternalHref', () => {
  it('is true for web, mail and phone links only', () => {
    expect(isExternalHref('https://example.com')).toBe(true)
    expect(isExternalHref('http://example.com')).toBe(true)
    expect(isExternalHref('mailto:a@b.c')).toBe(true)
    expect(isExternalHref('javascript:alert(1)')).toBe(false)
    expect(isExternalHref('#top')).toBe(false)
  })
})

describe('looksInteractive', () => {
  it('sees an event handler or a link to a board', () => {
    expect(looksInteractive('<button onClick="{{ pick }}">x</button>')).toBe(true)
    expect(looksInteractive('<input onChange="{{set}}">')).toBe(true)
    expect(looksInteractive('<a class="b" href="Cart.dc.html">Cart</a>')).toBe(true)
  })

  it('is false for a static board', () => {
    expect(looksInteractive('<div style="color: red">Hello</div>')).toBe(false)
    expect(looksInteractive('<a href="#top">Top</a>')).toBe(false)
    expect(looksInteractive('<a href="https://other.com/Cart.dc.html">x</a>')).toBe(false)
    expect(looksInteractive('<dc-import name="Table" rows="{{rows}}"></dc-import>')).toBe(false)
  })
})

describe('isInteractive', () => {
  it('takes the canvas.json flag over the source', () => {
    expect(isInteractive(false, '<button onClick="{{ go }}">x</button>')).toBe(false)
    expect(isInteractive(true, '<div></div>')).toBe(true)
    expect(isInteractive(undefined, '<button onClick="{{ go }}">x</button>')).toBe(true)
    expect(isInteractive(undefined, undefined)).toBe(false)
  })
})

describe('playScale', () => {
  it('shrinks a board that does not fit and never grows one', () => {
    expect(playScale({ width: 400, height: 300 }, { width: 1600, height: 1000 })).toBe(1)
    expect(playScale({ width: 1440, height: 900 }, { width: 768, height: 1000 })).toBeCloseTo(
      720 / 1440,
    )
  })
})

describe('playHref', () => {
  it('opens the board on its page in the given mode', () => {
    expect(playHref('flows', 'Cart', 'full')).toBe('/p/flows?board=Cart&play=full')
  })
})

describe('fillsWindow', () => {
  const page = (root: string) =>
    `<html><body><x-dc>\n<helmet><style>div{width:10px}</style></helmet>\n${root}\n</x-dc></body></html>`

  it('reads the root style after the helmet', () => {
    expect(rootStyleOf(page('<main style="max-width: 1200px; margin: 0 auto"><div></div></main>'))).toBe(
      'max-width: 1200px; margin: 0 auto',
    )
    expect(rootStyleOf(page('<div>x</div>'))).toBe('')
    expect(rootStyleOf('<div style="width: 10px"></div>')).toBeNull()
  })

  it('makes a wide board with a fluid root a page', () => {
    expect(fillsWindow(undefined, page('<main style="max-width: 1200px">x</main>'), 1440)).toBe(true)
    expect(hasFluidRoot(page('<div style="min-height: 100vh; width: 100%">x</div>'))).toBe(true)
  })

  it('keeps a fixed root or a narrow board at its size', () => {
    expect(fillsWindow(undefined, page('<div style="width: 1440px; height: 900px">x</div>'), 1440)).toBe(
      false,
    )
    expect(fillsWindow(undefined, page('<div style="padding: 24px">x</div>'), 390)).toBe(false)
  })

  it('takes expand from canvas.json first', () => {
    expect(fillsWindow('fill', page('<div style="width: 390px">x</div>'), 390)).toBe(true)
    expect(fillsWindow('none', page('<main>x</main>'), 1440)).toBe(false)
  })
})

describe('linkProblem', () => {
  it('tells a missing board from a failed lookup', () => {
    expect(linkProblem('Cart')).toBe('No board named Cart.')
    expect(linkProblem('Cart', new Error('HTTP 500'))).toBe('Could not open Cart: Error: HTTP 500')
  })
})
