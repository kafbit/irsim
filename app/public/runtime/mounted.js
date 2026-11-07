// @ts-check
/**
 * One live board instance: its DOM range, its Component instance, and the re-render loop that
 * keeps an imported child alive when the parent re-renders. Rendering itself lives in render.js
 * and arrives through the context, so this file has no import cycle to rely on.
 */

import { sameProps } from './eval.js'

/** @typedef {import('./parse.js').Node} Node */
/** @typedef {import('./render.js').Ctx} Ctx */
/** @typedef {import('./component.js').ComponentClass} ComponentClass */

/**
 * @typedef {object} RenderScope
 * @property {globalThis.Node} container
 * @property {string} path
 * @property {Map<string, Mounted>} children
 * @property {Map<string, Mounted>} previous
 */

export class Mounted {
  /**
   * @param {ComponentClass} Ctor
   * @param {Record<string, unknown>} props
   * @param {Ctx} ctx
   * @param {string} key
   * @param {Node[]} template
   */
  constructor(Ctor, props, ctx, key, template) {
    this.ctx = ctx
    this.key = key
    this.props = props
    this.template = template
    this.inst = new Ctor(props)
    this.inst.__update = () => this.schedule()
    this.start = ctx.doc.createComment(`dc:${key}:start`)
    this.end = ctx.doc.createComment(`dc:${key}:end`)
    /** @type {globalThis.Node[]} */
    this.nodes = []
    /** @type {Map<string, Mounted>} */
    this.children = new Map()
    this.updating = false
    this.queued = false
    this.rendered = false
    this.dead = false
  }

  schedule() {
    if (this.dead) return
    if (this.updating) {
      this.queued = true
      return
    }
    this.updating = true
    try {
      this.update()
    } finally {
      this.updating = false
    }
    if (this.queued) {
      this.queued = false
      this.schedule()
    }
  }

  update() {
    if (this.dead || !this.end.parentNode) return
    /** @type {Record<string, unknown>} */
    let scope
    try {
      scope = { ...this.props, ...this.inst.renderVals?.() }
    } catch (error) {
      this.fail(error)
      return
    }
    const frag = this.ctx.doc.createDocumentFragment()
    /** @type {RenderScope} */
    const rs = { container: frag, path: '', children: new Map(), previous: this.children }
    try {
      this.ctx.renderNodes(this.template, scope, this.ctx, rs)
    } catch (error) {
      this.fail(error)
      return
    }
    const fresh = Array.from(frag.childNodes)
    this.end.parentNode.insertBefore(frag, this.end)
    for (const node of this.nodes) if (!fresh.includes(node)) node.remove()
    this.nodes = fresh
    for (const [key, child] of this.children) if (!rs.children.has(key)) child.destroy()
    this.children = rs.children
    if (this.rendered) this.inst.componentDidUpdate?.()
    this.rendered = true
    queueMicrotask(() => this.ctx.flushRefs())
  }

  /** @param {unknown} error */
  fail(error) {
    this.ctx.onError(error, `component ${this.key}`)
    const box = this.ctx.doc.createElement('pre')
    box.setAttribute(
      'style',
      'margin:0;padding:8px 10px;border:1px solid #9a2a1a;border-radius:8px;background:#fbe9e7;color:#9a2a1a;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;direction:ltr',
    )
    box.textContent = String(/** @type {Error} */ (error)?.stack ?? error)
    for (const node of this.nodes) node.remove()
    this.end.parentNode?.insertBefore(box, this.end)
    this.nodes = [box]
  }

  /**
   * Update props in place when a parent re-renders. Returns false when nothing changed, which is
   * what lets a parent's `setState` leave an imported table's open menu alone.
   *
   * @param {Record<string, unknown>} props
   * @returns {boolean}
   */
  setProps(props) {
    if (sameProps(this.props, props)) return false
    this.props = props
    this.inst.props = props
    this.schedule()
    return true
  }

  destroy() {
    if (this.dead) return
    this.dead = true
    try {
      this.inst.componentWillUnmount?.()
    } catch (error) {
      this.ctx.onError(error, `unmount ${this.key}`)
    }
    for (const child of this.children.values()) child.destroy()
    this.children.clear()
    for (const node of this.nodes) node.remove()
    this.start.remove()
    this.end.remove()
  }
}

/**
 * Move a mounted child's whole anchor block into a new container. Copying it would lose the
 * instance; moving it is what keeps the child's state across a parent render.
 *
 * @param {Mounted} record
 * @param {globalThis.Node} container
 */
export const moveBlock = (record, container) => {
  /** @type {globalThis.Node | null} */
  let node = record.start
  while (node) {
    const next = node.nextSibling
    container.appendChild(node)
    if (node === record.end) break
    node = next
  }
}
