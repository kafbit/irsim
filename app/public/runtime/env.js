// @ts-check
/**
 * What the canvas changes about a board without touching the file: colour and scale values, the
 * catalogue string for a bound Arabic literal, and the direction of the preview.
 *
 * Colours are replaced in the board source before the browser parses it, so a change reaches a
 * `<style>` block, an inline `style` attribute and a component's own JS colour array alike.
 */

/**
 * @typedef {object} Env
 * @property {string} board
 * @property {'ar' | 'en'} locale
 * @property {number} rev
 * @property {{ colors?: Record<string, string>, radius?: Record<string, string>, font?: Record<string, string> }} tokens
 * @property {Record<string, string>} strings
 * @property {Partial<Record<'ar' | 'en', Record<string, string>>>} values
 */

const HEX = /#[0-9a-fA-F]{3,8}\b/g

/**
 * @param {string} source
 * @param {Record<string, string>} colors lowercased hex → value
 * @returns {string}
 */
export const applyColors = (source, colors) => {
  const keys = Object.keys(colors)
  if (keys.length === 0) return source
  return source.replace(HEX, (match) => colors[match.toLowerCase()] ?? match)
}

/** @param {string} value */
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replace `border-radius: 14px` and `font-size: 12px` by their configured value. The property is
 * part of the pattern on purpose: a bare `14px` also appears in widths and offsets, and changing
 * those is not what a radius variable means.
 *
 * @param {string} source
 * @param {{ radius?: Record<string, string>, font?: Record<string, string> }} tokens
 * @returns {string}
 */
export const applyScale = (source, tokens) => {
  /** @type {Array<[string, Record<string, string>]>} */
  const groups = [
    ['border(?:-[a-z]+)*-radius', tokens.radius ?? {}],
    ['font-size', tokens.font ?? {}],
  ]
  let out = source
  for (const [property, values] of groups) {
    for (const [from, to] of Object.entries(values)) {
      if (from === to) continue
      const pattern = new RegExp(`(${property}\\s*:\\s*)${escape(from)}(?![\\w.])`, 'gi')
      out = out.replace(pattern, `$1${to}`)
    }
  }
  return out
}

/**
 * Everything the server does to a board before it is served.
 *
 * @param {string} source
 * @param {Pick<Env, 'tokens'>} env
 * @returns {string}
 */
export const applyTokens = (source, env) =>
  applyScale(applyColors(source, env.tokens.colors ?? {}), env.tokens)

/**
 * The literal to text map for the chosen locale. In Arabic a bound literal maps to itself, which
 * keeps both modes on one code path and lets the coverage count run in either.
 *
 * @param {Env} env
 * @returns {Map<string, string>}
 */
const textMap = (env) => {
  const map = new Map()
  const values = env.values[env.locale] ?? {}
  for (const [literal, key] of Object.entries(env.strings)) {
    const value = values[key]
    if (typeof value === 'string') map.set(literal, value)
  }
  return map
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE'])
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt']

/**
 * Swap bound Arabic text for its catalogue value in the rendered tree. An unbound literal stays
 * where it is: this is a preview, and showing the Arabic is more honest than inventing English.
 *
 * @param {ParentNode} root
 * @param {Env} env
 * @returns {{ translated: number, remaining: number }}
 */
export const applyStrings = (root, env) => {
  const map = textMap(env)
  let translated = 0
  let remaining = 0
  if (map.size === 0) return { translated, remaining }
  const doc = /** @type {Document} */ (/** @type {Element} */ (root).ownerDocument ?? root)
  const walker = doc.createTreeWalker(/** @type {globalThis.Node} */ (root), 4)
  /** @type {Text[]} */
  const texts = []
  let current = walker.nextNode()
  while (current) {
    const parent = /** @type {Element | null} */ (/** @type {Node} */ (current).parentElement)
    if (!parent || !SKIP_TAGS.has(parent.tagName)) texts.push(/** @type {Text} */ (current))
    current = walker.nextNode()
  }
  for (const node of texts) {
    const raw = node.nodeValue ?? ''
    const trimmed = raw.trim()
    if (!/[ء-ي]/.test(trimmed)) continue
    const value = map.get(trimmed)
    if (value === undefined) {
      remaining += 1
      continue
    }
    translated += 1
    if (value === trimmed) continue
    const lead = raw.slice(0, raw.indexOf(trimmed))
    const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length)
    node.nodeValue = `${lead}${value}${tail}`
  }
  for (const element of Array.from(/** @type {Element} */ (root).querySelectorAll('*'))) {
    for (const name of ATTRS) {
      const value = element.getAttribute(name)
      if (!value) continue
      const bound = map.get(value.trim())
      if (bound !== undefined) {
        element.setAttribute(name, bound)
        translated += 1
      }
    }
  }
  return { translated, remaining }
}

/**
 * Set the preview language on the document, and in English mode turn a hard-coded `dir="rtl"`
 * around so the frames show what an English screen would look like.
 *
 * @param {Document} doc
 * @param {'ar' | 'en'} locale
 */
export const applyDirection = (doc, locale) => {
  doc.documentElement.lang = locale
  doc.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  if (locale === 'ar') return
  for (const element of Array.from(doc.querySelectorAll('[dir="rtl"]'))) {
    element.setAttribute('dir', 'ltr')
  }
  for (const element of Array.from(doc.querySelectorAll('[lang="ar"]'))) {
    element.setAttribute('lang', 'en')
  }
}

/**
 * The one call the board loader makes after a render.
 *
 * @param {Document} doc
 * @param {ParentNode} root
 * @param {Env} env
 */
export const applyEnv = (doc, root, env) => {
  applyDirection(doc, env.locale)
  return applyStrings(root, env)
}
