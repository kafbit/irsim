// @ts-check
/**
 * A board file (`.html`, or the legacy `.dc.html`), turned into the tree the renderer walks.
 *
 * The browser has already parsed the file by the time this runs, so the input is a Document and
 * not a string: `<x-dc>` survives as an unknown element, the template inside it as ordinary
 * nodes, and `type="text/x-dc"` keeps the component script inert. See docs/plans/.../01-runtime.md.
 */

import { stampLines } from './stamp.js'

/** @typedef {string | { path: string }} Part */
/**
 * @typedef {{ type: 'text', parts: Part[] }} TextNode
 * @typedef {{ type: 'element', ns: string, tag: string, attrs: Attr[], children: Node[] }} ElementNode
 * @typedef {{ type: 'if', parts: Part[], children: Node[] }} IfNode
 * @typedef {{ type: 'for', list: Part[], as: string, children: Node[] }} ForNode
 * @typedef {{ type: 'import', name: string, props: Attr[], id: number }} ImportNode
 * @typedef {TextNode | ElementNode | IfNode | ForNode | ImportNode} Node
 * @typedef {{ name: string, parts: Part[] }} Attr
 * @typedef {{ head: globalThis.Node[], template: Node[], props: Record<string, unknown>, script: string }} Board
 */

const HOLE = /\{\{([^{}]+)\}\}/g
const HINTS = /^hint-/

let nextImportId = 1

/**
 * Split text into literal strings and `{{path}}` lookups. A hole never contains an expression:
 * all 5,000+ in `design/` are dotted paths, so there is no parser here on purpose.
 *
 * @param {string} text
 * @returns {Part[]}
 */
export const splitParts = (text) => {
  /** @type {Part[]} */
  const parts = []
  let at = 0
  for (const match of text.matchAll(HOLE)) {
    const index = match.index ?? 0
    if (index > at) parts.push(text.slice(at, index))
    parts.push({ path: (match[1] ?? '').trim() })
    at = index + match[0].length
  }
  if (at < text.length || parts.length === 0) parts.push(text.slice(at))
  return parts
}

/**
 * True when the whole value is one hole, which is what makes an attribute keep the raw value
 * instead of becoming a string (`disabled="{{yes}}"`, `items="{{rows}}"`).
 *
 * @param {Part[]} parts
 * @returns {boolean}
 */
export const isSingleHole = (parts) => parts.length === 1 && typeof parts[0] !== 'string'

/**
 * @param {Element} element
 * @param {{ skip?: RegExp }} [options]
 * @returns {Attr[]}
 */
export const attributesOf = (element, options = {}) => {
  /** @type {Attr[]} */
  const attrs = []
  for (const attr of Array.from(element.attributes)) {
    if (options.skip?.test(attr.name)) continue
    attrs.push({ name: attr.name, parts: splitParts(attr.value) })
  }
  return attrs
}

/**
 * @param {globalThis.Node} node
 * @returns {Node[]}
 */
export const childrenOf = (node) => {
  /** @type {Node[]} */
  const out = []
  for (const child of Array.from(node.childNodes)) {
    const converted = convert(child)
    if (converted) out.push(converted)
  }
  return out
}

/**
 * @param {globalThis.Node} node
 * @returns {Node | null}
 */
const convert = (node) => {
  if (node.nodeType === 3) return { type: 'text', parts: splitParts(node.nodeValue ?? '') }
  if (node.nodeType !== 1) return null
  const element = /** @type {Element} */ (node)
  const marker = element.localName === 'template' ? element.getAttribute('data-sc') : null
  const tag = marker
    ? `sc-${marker}`.replace('sc-import', 'dc-import')
    : element.localName.toLowerCase()
  return convertTagged(element, tag)
}

/**
 * The element's children. A `<template>` keeps them in `.content`, not in `childNodes`.
 *
 * @param {Element} element
 * @returns {Node[]}
 */
const innerNodes = (element) => {
  const content = /** @type {HTMLTemplateElement} */ (element).content
  return childrenOf(element.localName === 'template' && content ? content : element)
}

/**
 * @param {Element} element
 * @param {string} tag
 * @returns {Node}
 */
const convertTagged = (element, tag) => {
  if (tag === 'sc-if') {
    return {
      type: 'if',
      parts: splitParts(element.getAttribute('value') ?? ''),
      children: innerNodes(element),
    }
  }
  if (tag === 'sc-for') {
    return {
      type: 'for',
      list: splitParts(element.getAttribute('list') ?? ''),
      as: element.getAttribute('as') ?? 'item',
      children: innerNodes(element),
    }
  }
  if (tag === 'dc-import') {
    const name = element.getAttribute('name') ?? ''
    return {
      type: 'import',
      name,
      props: attributesOf(element, { skip: /^(name|hint-)/ }).filter(
        (attr) => !HINTS.test(attr.name),
      ),
      id: nextImportId++,
    }
  }
  return {
    type: 'element',
    ns: element.namespaceURI ?? 'http://www.w3.org/1999/xhtml',
    tag: element.localName,
    attrs: attributesOf(element),
    children: innerNodes(element),
  }
}

/**
 * Boards put `sc-for` and `sc-if` straight inside `<tr>` and `<thead>`. The HTML parser moves
 * unknown elements out of a table, which drops the cells. `<template>` is legal there, so the
 * three control tags are rewritten to it before parsing and read back through `data-sc`.
 *
 * @param {string} source
 * @param {string} [board] when given, every opening tag inside `<x-dc>` is stamped first
 * @returns {string}
 */
export const prepareSource = (source, board) =>
  (board ? stampLines(source, board) : source)
    .replace(
      /<(sc-for|sc-if|dc-import)(?=[\s>])/g,
      (_, tag) => `<template data-sc="${tag === 'dc-import' ? 'import' : tag.slice(3)}"`,
    )
    .replace(/<\/(sc-for|sc-if|dc-import)>/g, '</template>')

/**
 * Read a board out of the document that loaded it.
 *
 * @param {Document} doc
 * @returns {Board}
 */
export const parseBoard = (doc) => {
  nextImportId = 1
  const xdc = doc.querySelector('x-dc')
  if (!xdc) throw new Error('board has no <x-dc> template')
  /** @type {globalThis.Node[]} */
  const head = []
  /** @type {Node[]} */
  const template = []
  for (const child of Array.from(xdc.childNodes)) {
    if (
      child.nodeType === 1 &&
      /** @type {Element} */ (child).localName.toLowerCase() === 'helmet'
    ) {
      head.push(...Array.from(child.childNodes))
      continue
    }
    const converted = convert(child)
    if (converted) template.push(converted)
  }
  const scriptTag = doc.querySelector('script[type="text/x-dc"]')
  const rawProps = scriptTag?.getAttribute('data-props') ?? '{}'
  /** @type {Record<string, unknown>} */
  let props = {}
  try {
    props = JSON.parse(rawProps)
  } catch (error) {
    throw new Error(`board data-props is not JSON: ${String(error)}`)
  }
  // `Icons` is a static board: no script, no props, and `instantiate` supplies an empty Component.
  return { head, template, props, script: scriptTag?.textContent ?? '' }
}

/**
 * The prop values a board starts with: every `default` in `data-props`, and `undefined` for the
 * entries whose editor is null.
 *
 * @param {Record<string, unknown>} props
 * @returns {{ props: Record<string, unknown>, preview: { width: number, height: number } | null }}
 */
export const defaultsOf = (props) => {
  /** @type {Record<string, unknown>} */
  const values = {}
  /** @type {{ width: number, height: number } | null} */
  let preview = null
  for (const [name, spec] of Object.entries(props)) {
    if (name === '$preview') {
      preview = /** @type {{ width: number, height: number }} */ (spec)
      continue
    }
    const entry = /** @type {{ default?: unknown }} */ (spec ?? {})
    if ('default' in entry) values[name] = entry.default
  }
  return { props: values, preview }
}

/**
 * The declared type of a prop, used to coerce a string attribute from a `dc-import`.
 *
 * @param {Record<string, unknown>} props
 * @param {string} name
 * @returns {'boolean' | 'number' | 'text'}
 */
export const propType = (props, name) => {
  const spec = /** @type {{ default?: unknown } | undefined} */ (props[name])
  const value = spec?.default
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}
