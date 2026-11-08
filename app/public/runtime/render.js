// @ts-check
/**
 * Template AST to DOM, plus the board context that wires the pieces together. The reconciler
 * that keeps imported children alive is in mounted.js.
 */

import { instantiate } from './component.js'
import { coerce, interpolate, rawValue } from './eval.js'
import { Mounted, moveBlock } from './mounted.js'
import { defaultsOf, isSingleHole, propType } from './parse.js'

/** @typedef {import('./parse.js').Board} Board */
/** @typedef {import('./parse.js').Node} Node */
/** @typedef {import('./parse.js').Attr} Attr */
/** @typedef {import('./parse.js').ImportNode} ImportNode */
/** @typedef {import('./component.js').ComponentClass} ComponentClass */

/**
 * @typedef {object} BoardDef
 * @property {Board} board
 * @property {Record<string, unknown>} props
 * @property {ComponentClass} Ctor
 */

/**
 * @typedef {object} Ctx
 * @property {Document} doc
 * @property {Map<string, BoardDef>} boards
 * @property {Array<[Function, Element]>} refs
 * @property {Set<string>} heads
 * @property {(error: unknown, where: string) => void} onError
 * @property {(nodes: Node[], scope: Record<string, unknown>, ctx: Ctx, rs: RenderScope) => void} renderNodes
 * @property {() => void} flushRefs
 */

/**
 * @typedef {object} RenderScope
 * @property {globalThis.Node} container
 * @property {string} path
 * @property {Map<string, Mounted>} children
 * @property {Map<string, Mounted>} previous
 */

const SVG = 'http://www.w3.org/2000/svg'
const EVENTS = { doubleclick: 'dblclick' }

/**
 * `on-change` on a `dc-import` is the child's `onChange` prop. HTML lowercases attribute names,
 * so the mapping has to happen here rather than in the template.
 *
 * @param {string} name
 * @returns {string}
 */
const propName = (name) => name.replace(/-([a-z])/g, (_, char) => String(char).toUpperCase())

/**
 * A board's `<helmet>` content goes into the frame's `<head>` once, however many times the board
 * is imported.
 *
 * @param {Ctx} ctx
 * @param {Board} board
 * @param {string} name
 */
const ensureHead = (ctx, board, name) => {
  if (ctx.heads.has(name) || board.head.length === 0) return
  ctx.heads.add(name)
  for (const node of board.head) ctx.doc.head.appendChild(node)
}

/**
 * @param {Element} element
 * @param {Attr} attr
 * @param {Record<string, unknown>} scope
 * @param {Ctx} ctx
 * @returns {boolean} true when the attribute was consumed as behaviour, not markup
 */
const behaviour = (element, attr, scope, ctx) => {
  if (/^on/i.test(attr.name)) {
    if (!isSingleHole(attr.parts)) return false
    const fn = rawValue(attr.parts, scope)
    if (typeof fn !== 'function') return false
    const name = attr.name.slice(2).toLowerCase()
    element.addEventListener(EVENTS[name] ?? name, /** @type {EventListener} */ (fn))
    return true
  }
  if (attr.name === 'ref') {
    if (!isSingleHole(attr.parts)) return false
    const fn = rawValue(attr.parts, scope)
    if (typeof fn !== 'function') return false
    ctx.refs.push([/** @type {Function} */ (fn), element])
    return true
  }
  return false
}

/**
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 */
const setAttribute = (element, name, value) => {
  if (value === null || value === undefined || value === false) return
  element.setAttribute(name, value === true ? '' : String(value))
}

/**
 * @param {Node[]} nodes
 * @param {Record<string, unknown>} scope
 * @param {Ctx} ctx
 * @param {RenderScope} rs
 */
export const renderNodes = (nodes, scope, ctx, rs) => {
  for (const node of nodes) renderNode(node, scope, ctx, rs)
}

/**
 * @param {Node} node
 * @param {Record<string, unknown>} scope
 * @param {Ctx} ctx
 * @param {RenderScope} rs
 */
const renderNode = (node, scope, ctx, rs) => {
  if (node.type === 'text') {
    rs.container.appendChild(ctx.doc.createTextNode(interpolate(node.parts, scope)))
    return
  }
  if (node.type === 'if') {
    if (rawValue(node.parts, scope)) renderNodes(node.children, scope, ctx, rs)
    return
  }
  if (node.type === 'for') {
    const list = rawValue(node.list, scope)
    if (!Array.isArray(list)) return
    list.forEach((item, index) => {
      const next = { ...scope, [node.as]: item, $index: index }
      renderNodes(node.children, next, ctx, { ...rs, path: `${rs.path}@${index}` })
    })
    return
  }
  if (node.type === 'import') {
    renderImport(node, scope, ctx, rs)
    return
  }
  const element =
    node.ns === SVG ? ctx.doc.createElementNS(node.ns, node.tag) : ctx.doc.createElement(node.tag)
  for (const attr of node.attrs) {
    if (behaviour(element, attr, scope, ctx)) continue
    const value = isSingleHole(attr.parts)
      ? rawValue(attr.parts, scope)
      : interpolate(attr.parts, scope)
    setAttribute(element, attr.name, value)
  }
  rs.container.appendChild(element)
  renderNodes(node.children, scope, ctx, { ...rs, container: element })
}

/**
 * @param {ImportNode} node
 * @param {Record<string, unknown>} scope
 * @param {Ctx} ctx
 * @param {RenderScope} rs
 */
const renderImport = (node, scope, ctx, rs) => {
  const def = ctx.boards.get(node.name)
  if (!def) {
    const missing = ctx.doc.createElement('span')
    missing.setAttribute(
      'style',
      'display:inline-block;padding:2px 6px;border:1px dashed #9a2a1a;border-radius:4px;color:#9a2a1a;font:11px ui-monospace,monospace;direction:ltr',
    )
    missing.textContent = `missing import: ${node.name}`
    rs.container.appendChild(missing)
    ctx.onError(new Error(`import ${node.name} was not loaded`), 'import')
    return
  }
  ensureHead(ctx, def.board, node.name)
  /** @type {Record<string, unknown>} */
  const props = { ...def.props }
  for (const attr of node.props) {
    const name = propName(attr.name)
    const value = isSingleHole(attr.parts)
      ? rawValue(attr.parts, scope)
      : interpolate(attr.parts, scope)
    props[name] = coerce(propType(def.board.props, name), value)
  }
  const key = `${node.id}${rs.path}`
  const previous = rs.previous.get(key)
  if (previous) {
    moveBlock(previous, rs.container)
    previous.setProps(props)
    rs.children.set(key, previous)
    return
  }
  const record = new Mounted(def.Ctor, props, ctx, key, def.board.template)
  rs.container.appendChild(record.start)
  rs.container.appendChild(record.end)
  record.update()
  rs.children.set(key, record)
}

/**
 * The context one board frame needs, with every board it imports already parsed.
 *
 * @param {Document} doc
 * @param {Record<string, Board>} boards name to parsed board, including the root
 * @param {{ onError?: (error: unknown, where: string) => void }} [options]
 * @returns {Ctx}
 */
export const createContext = (doc, boards, options = {}) => {
  /** @type {Map<string, BoardDef>} */
  const defs = new Map()
  for (const [name, board] of Object.entries(boards)) {
    const { props } = defaultsOf(board.props)
    defs.set(name, { board, props, Ctor: instantiate(board.script) })
  }
  /** @type {Ctx} */
  const ctx = {
    doc,
    boards: defs,
    refs: [],
    heads: new Set(),
    onError: options.onError ?? ((error, where) => console.error(`[canvas:${where}]`, error)),
    renderNodes,
    flushRefs: () => {
      const pending = ctx.refs.splice(0)
      for (const [fn, element] of pending) {
        try {
          fn(element)
        } catch (error) {
          ctx.onError(error, 'ref')
        }
      }
    },
  }
  return ctx
}

/**
 * Render the root board into `target`, the empty `<x-dc>` element.
 *
 * @param {Element} target
 * @param {string} name
 * @param {Ctx} ctx
 * @returns {Mounted}
 */
export const mountBoard = (target, name, ctx) => {
  const def = ctx.boards.get(name)
  if (!def) throw new Error(`board ${name} was not parsed`)
  ensureHead(ctx, def.board, name)
  const root = new Mounted(def.Ctor, def.props, ctx, 'root', def.board.template)
  target.appendChild(root.start)
  target.appendChild(root.end)
  root.update()
  ctx.flushRefs()
  return root
}
