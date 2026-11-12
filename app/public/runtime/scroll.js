// @ts-check

/**
 * @typedef {object} Scroller
 * @property {number} scrollTop
 * @property {number} scrollLeft
 * @property {number} scrollHeight
 * @property {number} scrollWidth
 * @property {number} clientHeight
 * @property {number} clientWidth
 * @property {Scroller | null} parentElement
 */

/** @typedef {{ overflowX: string, overflowY: string, direction: string }} ScrollStyle */

const SCROLLS = /^(auto|scroll|overlay)$/

/**
 * Whether one axis can still move by the sign of `delta`. In RTL, `scrollLeft` runs from 0 down to
 * `-(size - client)`.
 *
 * @param {number} position
 * @param {number} size
 * @param {number} client
 * @param {number} delta
 * @param {boolean} rtl
 * @returns {boolean}
 */
export const hasRoom = (position, size, client, delta, rtl) => {
  const max = size - client
  if (max < 1 || delta === 0) return false
  if (rtl) return delta > 0 ? position < -0.5 : position > -max + 0.5
  return delta > 0 ? position < max - 0.5 : position > 0.5
}

/**
 * Whether a wheel at `target` scrolls `target`, one of its ancestors, or the page (`root`, the
 * document's scrolling element). Only the dominant axis of the wheel counts.
 *
 * @param {Scroller | null} target
 * @param {Scroller} root
 * @param {number} dx
 * @param {number} dy
 * @param {(node: Scroller) => ScrollStyle} styleOf
 * @returns {boolean}
 */
export const wheelScrolls = (target, root, dx, dy, styleOf) => {
  const vertical = Math.abs(dy) >= Math.abs(dx)
  const delta = vertical ? dy : dx
  for (let node = target; node; node = node.parentElement) {
    const style = styleOf(node)
    const overflow = vertical ? style.overflowY : style.overflowX
    if (node === root ? overflow === 'hidden' : !SCROLLS.test(overflow)) continue
    const room = vertical
      ? hasRoom(node.scrollTop, node.scrollHeight, node.clientHeight, delta, false)
      : hasRoom(node.scrollLeft, node.scrollWidth, node.clientWidth, delta, style.direction === 'rtl')
    if (room) return true
  }
  return false
}
