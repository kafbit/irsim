import type { PresetId } from './viewport'

export const TOUCH_PRESETS: readonly PresetId[] = ['phone', 'large-phone', 'tablet']

export type TouchPref = 'on' | 'off' | null

export const touchOn = (pref: TouchPref, preset: PresetId): boolean =>
  pref === null ? TOUCH_PRESETS.includes(preset) : pref === 'on'

const THRESHOLD = 4
const TEXT = 'input, textarea, select, [contenteditable]'

const css = (drag: boolean) =>
  `html,body{scrollbar-width:none}*::-webkit-scrollbar{display:none}${
    drag
      ? 'html{user-select:none;-webkit-user-select:none;cursor:grab}input,textarea,select,[contenteditable]{user-select:text;-webkit-user-select:text}'
      : ''
  }`

const DOT =
  'position:fixed;left:0;top:0;width:28px;height:28px;box-sizing:border-box;border:1px solid rgba(20,22,26,0.9);border-radius:50%;background:rgba(20,22,26,0.22);transform:translate(-50%,-50%);pointer-events:none;z-index:2147483647;display:none'

export function attachTouch(doc: Document, options: { drag: boolean }): () => void {
  const win = doc.defaultView
  if (!win || !doc.head || !doc.body) return () => {}

  const style = doc.createElement('style')
  style.setAttribute('data-irsim-touch', '')
  style.textContent = css(options.drag)
  doc.head.appendChild(style)

  const dot = doc.createElement('div')
  dot.setAttribute('aria-hidden', 'true')
  dot.setAttribute('data-irsim-touch-dot', '')
  dot.style.cssText = DOT
  doc.body.appendChild(dot)

  const place = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    dot.style.display = 'block'
    dot.style.left = `${event.clientX}px`
    dot.style.top = `${event.clientY}px`
  }
  const hide = () => {
    dot.style.display = 'none'
  }

  const canScroll = (element: Element, axis: 'x' | 'y'): boolean => {
    const computed = win.getComputedStyle(element)
    const overflow = axis === 'x' ? computed.overflowX : computed.overflowY
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false
    return axis === 'x'
      ? element.scrollWidth > element.clientWidth
      : element.scrollHeight > element.clientHeight
  }

  const scroller = (from: Element | null, axis: 'x' | 'y'): Element | null => {
    for (let element = from; element; element = element.parentElement) {
      if (canScroll(element, axis)) return element
    }
    return doc.scrollingElement
  }

  let start: { x: number; y: number; target: Element | null } | null = null
  let last = { x: 0, y: 0 }
  let moved = false
  let dragged = false

  const onDown = (event: PointerEvent) => {
    place(event)
    dragged = false
    if (!options.drag) return
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const target = event.target instanceof win.Element ? event.target : null
    if (target?.closest(TEXT)) return
    start = { x: event.clientX, y: event.clientY, target }
    last = { x: event.clientX, y: event.clientY }
    moved = false
  }

  const onMove = (event: PointerEvent) => {
    place(event)
    if (!options.drag || !start || event.pointerType !== 'mouse') return
    if ((event.buttons & 1) === 0) {
      start = null
      return
    }
    if (!moved) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= THRESHOLD) return
      moved = true
      dragged = true
    }
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    last = { x: event.clientX, y: event.clientY }
    if (dx !== 0) scroller(start.target, 'x')?.scrollBy(-dx, 0)
    if (dy !== 0) scroller(start.target, 'y')?.scrollBy(0, -dy)
  }

  const onUp = () => {
    start = null
    moved = false
  }

  const onClick = (event: MouseEvent) => {
    if (!dragged) return
    dragged = false
    event.preventDefault()
    event.stopPropagation()
  }

  const root = doc.documentElement
  doc.addEventListener('pointerdown', onDown, true)
  doc.addEventListener('pointermove', onMove, true)
  doc.addEventListener('pointerup', onUp, true)
  doc.addEventListener('pointercancel', onUp, true)
  doc.addEventListener('click', onClick, true)
  root.addEventListener('pointerleave', hide)
  root.addEventListener('mouseleave', hide)

  return () => {
    style.remove()
    dot.remove()
    doc.removeEventListener('pointerdown', onDown, true)
    doc.removeEventListener('pointermove', onMove, true)
    doc.removeEventListener('pointerup', onUp, true)
    doc.removeEventListener('pointercancel', onUp, true)
    doc.removeEventListener('click', onClick, true)
    root.removeEventListener('pointerleave', hide)
    root.removeEventListener('mouseleave', hide)
  }
}
