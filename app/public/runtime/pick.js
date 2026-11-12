// @ts-check
/**
 * Comment mode inside a frame: outline the stamped element under the pointer and report a click on
 * it to the parent. Stamps come from `stampLines` in stamp.js.
 */

const BASE = 'position:fixed;pointer-events:none;z-index:2147483647;outline-offset:0'
const FALLBACK_PICK = '#14161a'
const SWALLOWED = ['pointerdown', 'mousedown', 'mouseup']
const MAX_PATH = 4
const MAX_TEXT = 80

/**
 * The canvas's own `--pick`, the colour of the box around a picked element, so the hover outline and
 * the picked box match. A frame opened on its own has no parent and takes the fallback.
 * @returns {string}
 */
const ringColor = () => {
  try {
    const value = getComputedStyle(parent.document.documentElement).getPropertyValue('--pick')
    return value.trim() || FALLBACK_PICK
  } catch {
    return FALLBACK_PICK
  }
}

/**
 * The outline width that reads as 2 screen pixels: the canvas scales the frame, and the box around
 * a picked element is drawn outside it at a constant width.
 * @returns {number}
 */
const lineWidth = () => {
  const frame = window.frameElement
  const scale =
    frame && window.innerWidth ? frame.getBoundingClientRect().width / window.innerWidth : 1
  return scale > 0 ? 2 / scale : 2
}

/**
 * @param {EventTarget | null} target
 * @returns {Element | null}
 */
const stampedAt = (target) => (target instanceof Element ? target.closest('[data-dc-at]') : null)

/**
 * @param {Element} element
 * @returns {string}
 */
const pathOf = (element) => {
  /** @type {string[]} */
  const steps = []
  for (
    let node = /** @type {Element | null} */ (element);
    node && steps.length < MAX_PATH;
    node = node.parentElement
  ) {
    const tag = node.localName
    if (tag === 'body' || tag === 'html' || tag === 'x-dc') break
    const first = node.classList[0]
    steps.unshift(first ? `${tag}.${first}` : tag)
  }
  return steps.join(' > ')
}

/**
 * @param {Element} element
 * @returns {{ file: string, line: number, element: { tag: string, path: string, text: string }, rect: { x: number, y: number, width: number, height: number } }}
 */
const detailsOf = (element) => {
  const stamp = element.getAttribute('data-dc-at') ?? ''
  const cut = stamp.lastIndexOf(':')
  const box = element.getBoundingClientRect()
  return {
    file: `design/${stamp.slice(0, cut)}.dc.html`,
    line: Number(stamp.slice(cut + 1)),
    element: {
      tag: element.localName,
      path: pathOf(element),
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
    },
    rect: {
      x: Math.round(box.x + scrollX),
      y: Math.round(box.y + scrollY),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  }
}

/**
 * @param {(type: string, details?: unknown) => void} post
 * @returns {{ setOn: (on: boolean) => void }}
 */
export const createPicker = (post) => {
  /** @type {HTMLDivElement | null} */
  let outline = null
  /** @type {HTMLStyleElement | null} */
  let cursor = null
  /** @type {Element | null} */
  let hovered = null
  /** @type {{ left: number, top: number } | null} */
  let origin = null

  /** @param {Element | null} element */
  const showOutline = (element) => {
    hovered = element
    if (!outline) return
    if (!element) {
      outline.style.display = 'none'
      return
    }
    const box = element.getBoundingClientRect()
    const css = (/** @type {number} */ left, /** @type {number} */ top) =>
      `${BASE};outline:${lineWidth()}px solid ${ringColor()};left:${left}px;top:${top}px;width:${box.width}px;height:${box.height}px`
    // A fixed box is placed inside the viewport's scrollbars, getBoundingClientRect outside them: an
    // RTL page has its scrollbar on the left, so read the real origin back and subtract it. It only
    // changes with the window size, so it is measured once and again after a resize.
    if (!origin) {
      outline.style.cssText = css(0, 0)
      const measured = outline.getBoundingClientRect()
      origin = { left: measured.left, top: measured.top }
    }
    outline.style.cssText = css(box.left - origin.left, box.top - origin.top)
  }

  /** @param {Event} event */
  const onMove = (event) => {
    const next = stampedAt(event.target)
    if (next !== hovered) showOutline(next)
  }

  /** @param {Event} event */
  const onClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const element = stampedAt(event.target)
    if (element) post('pick', detailsOf(element))
  }

  /** @param {Event} event */
  const swallow = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const refresh = () => showOutline(hovered)

  const forgetOrigin = () => {
    origin = null
    refresh()
  }

  /** @param {boolean} on */
  const setOn = (on) => {
    const action = on ? 'addEventListener' : 'removeEventListener'
    document[action]('mousemove', onMove, true)
    document[action]('click', onClick, true)
    for (const type of SWALLOWED) document[action](type, swallow, true)
    window[action]('scroll', refresh, true)
    window[action]('resize', forgetOrigin)
    if (on && !outline) {
      outline = document.createElement('div')
      outline.style.cssText = `${BASE};display:none`
      cursor = document.createElement('style')
      cursor.textContent = '*{cursor:crosshair!important}'
      document.documentElement.append(outline, cursor)
    }
    if (!on) {
      outline?.remove()
      cursor?.remove()
      outline = null
      cursor = null
      hovered = null
      origin = null
    }
  }

  return { setOn }
}
