// @ts-check
// A re-render replaces elements, so a pointer capture must move to the equivalent new element.

/**
 * @typedef {object} Capture
 * @property {number} pointerId
 * @property {number[]} path
 * @property {string} localName
 */

/** @type {Map<number, Element>} */
const held = new Map()

/** @type {WeakSet<object>} */
const installed = new WeakSet()

/**
 * @param {globalThis.Node} node
 * @returns {number}
 */
const indexIn = (node) =>
  node.parentNode ? Array.prototype.indexOf.call(node.parentNode.childNodes, node) : -1

/**
 * Child-index path of `target` from the top-level `nodes`: `[topIndex, childIndex, ...]`.
 * Returns null when `target` is not inside any of them.
 *
 * @param {globalThis.Node[]} nodes
 * @param {globalThis.Node} target
 * @returns {number[] | null}
 */
export const pathWithin = (nodes, target) => {
  /** @type {number[]} */
  const trail = []
  /** @type {globalThis.Node | null} */
  let node = target
  while (node) {
    const top = nodes.indexOf(node)
    if (top >= 0) return [top, ...trail.reverse()]
    const at = indexIn(node)
    if (at < 0) return null
    trail.push(at)
    node = node.parentNode
  }
  return null
}

/**
 * @param {globalThis.Node[]} fresh
 * @param {number[]} path
 * @returns {globalThis.Node | null}
 */
export const resolvePath = (fresh, path) => {
  const [top, ...rest] = path
  /** @type {globalThis.Node | undefined} */
  let node = top === undefined ? undefined : fresh[top]
  for (const at of rest) {
    node = node?.childNodes[at]
  }
  return node ?? null
}

/** @param {Window} win */
export const installCaptureTracking = (win) => {
  if (installed.has(win)) return
  installed.add(win)
  const proto = win.Element.prototype
  const original = proto.setPointerCapture
  proto.setPointerCapture = function (pointerId) {
    original.call(this, pointerId)
    held.set(pointerId, this)
  }
  win.document.addEventListener(
    'lostpointercapture',
    (event) => {
      if (held.get(event.pointerId) === event.target) held.delete(event.pointerId)
    },
    true,
  )
  const release = (/** @type {PointerEvent} */ event) => held.delete(event.pointerId)
  win.document.addEventListener('pointerup', release, true)
  win.document.addEventListener('pointercancel', release, true)
}

/**
 * @param {globalThis.Node[]} nodes
 * @returns {Capture[]}
 */
export const takeCaptures = (nodes) => {
  /** @type {Capture[]} */
  const out = []
  for (const [pointerId, element] of held) {
    const path = pathWithin(nodes, element)
    if (path) out.push({ pointerId, path, localName: element.localName })
  }
  return out
}

/**
 * @param {Capture[]} captures
 * @param {globalThis.Node[]} fresh
 */
export const carryCaptures = (captures, fresh) => {
  for (const { pointerId, path, localName } of captures) {
    const target = resolvePath(fresh, path)
    if (target?.nodeType !== 1 || /** @type {Element} */ (target).localName !== localName) continue
    try {
      ;/** @type {Element} */ (target).setPointerCapture(pointerId)
      held.set(pointerId, /** @type {Element} */ (target))
    } catch {
      held.delete(pointerId)
    }
  }
}
