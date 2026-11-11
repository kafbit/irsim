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

/** @typedef {{ root: string, boards: Record<string, string>, missing: string[] }} Bundle */

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
    const ctx = createContext(document, boards, { onError })
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
window.addEventListener('keydown', (event) => event.key === 'Escape' && post('escape'))
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
window.addEventListener(
  'wheel',
  (event) => {
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const { deltaX, deltaY, deltaMode, ctrlKey, metaKey, clientX, clientY } = event
    post('wheel', { deltaX, deltaY, deltaMode, ctrlKey, metaKey, clientX, clientY })
  },
  { passive: false },
)
window.addEventListener('error', (event) => onError(event.error ?? event.message, 'window'))

void start()
