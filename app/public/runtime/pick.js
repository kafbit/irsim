// @ts-check
/**
 * Comment mode inside a frame: outline the stamped element under the pointer and report a click on
 * it to the parent. Stamps come from `stampLines` in stamp.js.
 */

const OUTLINE =
  'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #2563eb;outline-offset:-2px;display:none'
const SWALLOWED = ['pointerdown', 'mousedown', 'mouseup']
const MAX_PATH = 4
const MAX_TEXT = 80

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

  /** @param {Element | null} element */
  const showOutline = (element) => {
    hovered = element
    if (!outline) return
    if (!element) {
      outline.style.display = 'none'
      return
    }
    const box = element.getBoundingClientRect()
    outline.style.cssText = `${OUTLINE};left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`
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

  /** @param {boolean} on */
  const setOn = (on) => {
    const action = on ? 'addEventListener' : 'removeEventListener'
    document[action]('mousemove', onMove, true)
    document[action]('click', onClick, true)
    for (const type of SWALLOWED) document[action](type, swallow, true)
    window[action]('scroll', refresh, true)
    if (on && !outline) {
      outline = document.createElement('div')
      outline.style.cssText = OUTLINE
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
    }
  }

  return { setOn }
}
