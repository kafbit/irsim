// @ts-check
/**
 * The hole language: a dotted lookup and nothing else. Raw values for a whole-attribute hole,
 * strings for a mixed one, and the coercion an imported component needs for its string props.
 */

/** @typedef {import('./parse.js').Part} Part */

/**
 * Read `a.b.c` out of the render scope. A missing branch is `undefined`, never a throw: a board
 * that forgets a value should draw an empty space, not lose the whole frame.
 *
 * @param {Record<string, unknown>} scope
 * @param {string} path
 * @returns {unknown}
 */
export const lookup = (scope, path) => {
  /** @type {unknown} */
  let value = scope
  for (const key of path.split('.')) {
    // `__proto__` in a board would otherwise reach Object.prototype, and the canvas runs with the
    // dev server's origin: it is a local tool, but there is no reason to be sloppy about it.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined
    if (value === null || value === undefined || typeof value !== 'object') return undefined
    value = /** @type {Record<string, unknown>} */ (value)[key]
  }
  return value
}

/**
 * A hole's value as text. `null`/`undefined` draw nothing.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const textOf = (value) => (value === null || value === undefined ? '' : String(value))

/**
 * The value of a `{{…}}`-only attribute: the object, array, boolean or number itself.
 *
 * @param {Part[]} parts
 * @param {Record<string, unknown>} scope
 * @returns {unknown}
 */
export const rawValue = (parts, scope) => {
  const only = parts[0]
  return typeof only === 'string' ? only : lookup(scope, only.path)
}

/**
 * The value of an attribute or text node, with every hole interpolated.
 *
 * @param {Part[]} parts
 * @param {Record<string, unknown>} scope
 * @returns {string}
 */
export const interpolate = (parts, scope) =>
  parts.map((part) => (typeof part === 'string' ? part : textOf(lookup(scope, part.path)))).join('')

/**
 * Coerce an attribute written on a `dc-import` to the type its target declares. Without this,
 * `disabled="{{no}}"` arrives at the child as the string `"false"`, which is truthy.
 *
 * @param {'boolean' | 'number' | 'text'} type
 * @param {unknown} value
 * @returns {unknown}
 */
export const coerce = (type, value) => {
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === '') return true
    if (value === 'false' || value === null || value === undefined) return false
    return Boolean(value)
  }
  if (type === 'number') {
    if (typeof value === 'number') return value
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

/**
 * Shallow equality, enough to decide whether an imported component's props changed and it must
 * re-render. Arrays and objects are compared by identity and by their JSON, because a board builds
 * them fresh on every render.
 *
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @returns {boolean}
 */
export const sameProps = (a, b) => {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const key of keys) {
    const left = a[key]
    const right = b[key]
    if (left === right) continue
    if (typeof left === 'function' || typeof right === 'function') return false
    try {
      if (JSON.stringify(left) !== JSON.stringify(right)) return false
    } catch {
      return false
    }
  }
  return true
}
