// @ts-check
/**
 * Frame boot: read the canvas env and the board bundle the server embedded, render the board, then
 * tell the parent. This file is the `./support.js` every board already points at.
 */

import { installCaptureTracking } from './capture.js'
import { applyEnv, applyTokens } from './env.js'
import { installLinks } from './links.js'
import { parseBoard, prepareSource } from './parse.js'
import { createPicker } from './pick.js'
import { createContext, mountBoard } from './render.js'
import { wheelScrolls } from './scroll.js'

/** @typedef {import('./env.js').Env} Env */
/** @typedef {import('./parse.js').Board} Board */

/**
 * @returns {Env}
 */
const readEnv = () => {
  const injected = /** @type {Env | undefined} */ (/** @type {any} */ (window).__CANVAS_ENV__)
  if (injected) return injected
  // Opening a board URL directly is the debugging path; the canvas always injects the env.
  const name = decodeURIComponent(location.pathname.replace(/^\/b\//, '')) || 'Leads'
  return { board: name, locale: 'ar', rev: 0, tokens: {}, strings: {}, values: {} }
}

const env = readEnv()
const onCanvas = new URLSearchParams(location.search).get('canvas') === '1'

/** @type {{ message: string, where: string }[]} */
const problems = []

/**
 * @param {unknown} error
 * @param {string} where
 */
const onError = (error, where) => {
  problems.push({ where, message: String(/** @type {Error} */ (error)?.message ?? error) })
  console.error(`[canvas:${where}]`, error)
}

/**
 * @param {string} type
 * @param {unknown} [details]
 */
const post = (type, details) => {
  parent.postMessage({ type, board: env.board, details }, '*')
}

/** @typedef {{ root: string, boards: Record<string, string>, missing: string[], shared?: string[] }} Bundle */

/**
 * `table-sort.js` becomes `tableSort` and `ui/format.js` becomes `uiFormat`.
 *
 * @param {string} path
 * @returns {string}
 */
const sharedKey = (path) =>
  path
    .replace(/\.[^./]+$/, '')
    .split(/[/\-_.]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('')

/**
 * @param {string[]} paths
 * @returns {Promise<Record<string, unknown>>}
 */
const loadShared = async (paths) => {
  /** @type {Record<string, unknown>} */
  const shared = {}
  for (const path of paths) {
    try {
      shared[sharedKey(path)] = await import(new URL(`./shared/${path}`, location.href).href)
    } catch (error) {
      onError(error, 'shared')
    }
  }
  return shared
}

/**
 * @returns {string}
 */
const readRoot = () => {
  const element = document.getElementById('dc-root')
  if (!(element instanceof HTMLTemplateElement)) throw new Error('the frame has no #dc-root')
  return element.content.textContent ?? ''
}

/**
 * @returns {Bundle}
 */
const readBundle = () => {
  const element = document.getElementById('dc-bundle')
  if (!element) throw new Error('the frame has no #dc-bundle')
  return /** @type {Bundle} */ (JSON.parse(element.textContent ?? ''))
}

/**
 * @param {string} source
 * @param {string} board
 * @returns {Board}
 */
const parseSource = (source, board) =>
  parseBoard(
    new DOMParser().parseFromString(applyTokens(prepareSource(source, board), env), 'text/html'),
  )

const start = async () => {
  try {
    const bundle = readBundle()
    /** @type {Record<string, Board>} */
    const boards = { [env.board]: parseSource(readRoot(), env.board) }
    for (const [name, source] of Object.entries(bundle.boards))
      boards[name] = parseSource(source, name)
    for (const name of bundle.missing) onError(new Error(`import ${name} was not found`), 'import')
    const ctx = createContext(document, boards, { onError, shared: await loadShared(bundle.shared ?? []) })
    const target = document.querySelector('x-dc')
    if (!target) throw new Error('board has no <x-dc> template')
    target.replaceChildren()
    mountBoard(target, env.board, ctx)
    const stats = applyEnv(document, document.body, env)
    post('strings', stats)
    post('ready', { problems, closure: Object.keys(boards) })
  } catch (error) {
    onError(error, 'boot')
    post('error', { problems, message: String(/** @type {Error} */ (error)?.message ?? error) })
  }
}

installCaptureTracking(window)
installLinks(document, post)
const picker = createPicker(post)
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'comment-mode') return
  picker.setOn(event.data.on === true)
})
/**
 * @param {unknown} value
 * @returns {value is number}
 */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

window.addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'scroll-to') return
  const { rect, scroll } = event.data
  if (rect && [rect.x, rect.y, rect.width, rect.height].every(isNumber)) {
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    const visible =
      centerX >= window.scrollX &&
      centerX <= window.scrollX + window.innerWidth &&
      centerY >= window.scrollY &&
      centerY <= window.scrollY + window.innerHeight
    if (visible) return
    window.scrollTo({
      left: Math.max(0, centerX - window.innerWidth / 2),
      top: Math.max(0, centerY - window.innerHeight / 2),
      behavior: 'smooth',
    })
    return
  }
  if (scroll && isNumber(scroll.x) && isNumber(scroll.y)) {
    window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'smooth' })
  }
})
window.addEventListener('keydown', (event) => event.key === 'Escape' && post('escape'))
if (!onCanvas) {
  let scrollQueued = false
  window.addEventListener(
    'scroll',
    () => {
      if (scrollQueued) return
      scrollQueued = true
      requestAnimationFrame(() => {
        scrollQueued = false
        post('scroll', { x: window.scrollX, y: window.scrollY })
      })
    },
    { passive: true },
  )
}
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  post('comment-key')
})
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const command = '+='.includes(event.key)
    ? 'zoom-in'
    : '-_'.includes(event.key)
      ? 'zoom-out'
      : null
  if (!command || event.key.length !== 1) return
  event.preventDefault()
  post('zoom-chord', { command })
})
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
  if (event.key.toLowerCase() !== 'k') return
  event.preventDefault()
  post('search-chord')
})
window.addEventListener(
  'wheel',
  (event) => {
    if (event.defaultPrevented) return
    if (!(event.ctrlKey || event.metaKey)) {
      if (!onCanvas) return
      const root = document.scrollingElement
      const target = event.target instanceof Element ? event.target : null
      const styleOf = (/** @type {any} */ node) => getComputedStyle(node)
      if (!root || wheelScrolls(target, root, event.deltaX, event.deltaY, styleOf)) return
    }
    event.preventDefault()
    const { deltaX, deltaY, deltaMode, ctrlKey, metaKey, clientX, clientY } = event
    post('wheel', { deltaX, deltaY, deltaMode, ctrlKey, metaKey, clientX, clientY })
  },
  { passive: false },
)
window.addEventListener('error', (event) => onError(event.error ?? event.message, 'window'))

void start()
