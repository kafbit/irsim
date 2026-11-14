import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { boardsOnDisk, buildCanvas, readBoard } from './build-canvas.mjs'

const BOARD_NAME = /^[A-Za-z][A-Za-z0-9]*$/
const SUFFIX = '.dc.html'
const UNSORTED = { id: 'unsorted', title: 'Unsorted' }
const GAP = 80
const ROW_WIDTH = 12000
const ASSETS = join(import.meta.dirname, 'preview')

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

/** `child` is `parent` or below it, whether or not `parent` ends with a separator. */
const within = (parent, child) =>
  child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)

/** Either path is the other, or one holds the other. */
const overlaps = (a, b) => within(a, b) || within(b, a)

const sourcesOf = (designDir, names) => {
  const sources = new Map()
  for (const name of names) sources.set(name, readFileSync(join(designDir, `${name}${SUFFIX}`), 'utf8'))
  return sources
}

/**
 * The board and every board it imports, read from `design/`. A missing import is returned in
 * `missing` instead of failing the export.
 */
export const readClosure = (sources, board) => {
  const boards = {}
  const missing = []
  const seen = new Set()
  const queue = [board]
  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    const source = sources.get(name)
    if (source === undefined) {
      missing.push(name)
      continue
    }
    boards[name] = source
    for (const match of source.matchAll(/<dc-import\s+name=(?:"([^"]*)"|'([^']*)')/g)) {
      const imported = match[1] ?? match[2]
      if (imported) queue.push(imported)
    }
  }
  return { boards, missing }
}

/**
 * One board as a frame the runtime can boot: the board's own head (with `./support.js` pointed at
 * the exported runtime), an empty `<x-dc>`, the canvas env, the root source once in
 * `<template id="dc-root">` and every imported board in `#dc-bundle`, so the frame fetches nothing
 * else. Mirrors `app/src/app/b/[board]/route.ts`.
 */
export const frameDocument = (source, board, closure, runtimeHref = '../runtime/support.js') => {
  const imports = Object.fromEntries(
    Object.entries(closure.boards).filter(([name]) => name !== board),
  )
  const bundle = jsonForScript({ root: board, boards: imports, missing: closure.missing })
  const env = { board, locale: 'ar', rev: 0, tokens: {}, strings: {}, values: {} }
  const open = source.search(/<x-dc[\s>]/)
  const shell = open < 0 ? source : `${source.slice(0, open)}<x-dc></x-dc>\n</body>\n</html>\n`
  const document = shell.replace(
    /<script\s+src="\.\/support\.js"\s*><\/script>/g,
    `<script type="module" src="${runtimeHref}"></script>`,
  )
  const injected =
    `<script>window.__CANVAS_ENV__=${jsonForScript(env)}</script>` +
    `<script type="application/json" id="dc-bundle">${bundle}</script>` +
    `<template id="dc-root">${source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</template>`
  return document.includes('</head>')
    ? document.replace('</head>', () => `${injected}</head>`)
    : document
}

/** Reads `canvas.json`, building it first when the design folder has none yet. */
const readCanvas = (designDir) => {
  const file = join(designDir, 'canvas.json')
  if (!existsSync(file)) buildCanvas(designDir)
  const canvas = JSON.parse(readFileSync(file, 'utf8'))
  const pages = Array.isArray(canvas?.pages) ? canvas.pages : []
  return pages
    .filter((page) => page && typeof page.id === 'string' && typeof page.title === 'string')
    .map((page) => ({
      id: page.id,
      title: page.title,
      boards: Array.isArray(page.boards) ? page.boards : [],
    }))
}

/** Lays unlisted boards out in a grid, after the boards already on the `unsorted` page. */
const unorderedPage = (names, designDir, pages) => {
  const existing = pages.find((page) => page.id === UNSORTED.id)
  const bottom = existing
    ? existing.boards.reduce((max, board) => Math.max(max, (board.y || 0) + (board.height || 0)), 0)
    : 0
  const boards = []
  let x = 0
  let y = existing && existing.boards.length > 0 ? bottom + GAP : 0
  let rowHeight = 0
  for (const name of names) {
    const meta = readBoard(readFileSync(join(designDir, `${name}${SUFFIX}`), 'utf8'))
    if (x > 0 && x + meta.width > ROW_WIDTH) {
      y += rowHeight + GAP
      x = 0
      rowHeight = 0
    }
    boards.push({ name, title: meta.title, x, y, width: meta.width, height: meta.height })
    x += meta.width + GAP
    rowHeight = Math.max(rowHeight, meta.height)
  }
  return { id: UNSORTED.id, title: UNSORTED.title, boards }
}

/**
 * Turns a design folder into a standalone static site: `index.html`, the viewer assets, a frame
 * per board under `b/`, and the runtime under `runtime/`. Every URL is relative, so the folder
 * works from any static host and any subpath.
 */
export const exportSite = ({ designDir, outDir, runtimeDir, title = 'irsim preview' }) => {
  const design = resolve(designDir)
  const out = resolve(outDir)
  if (!existsSync(design)) throw new Error(`no design folder at ${design}`)
  if (overlaps(out, design)) {
    throw new Error(`refusing to write ${out}: it overlaps the design folder ${design}`)
  }
  if (!existsSync(join(runtimeDir, 'support.js'))) {
    throw new Error(`no board runtime at ${runtimeDir}`)
  }

  const names = boardsOnDisk(design).filter((name) => BOARD_NAME.test(name)).sort()
  const sources = sourcesOf(design, names)
  const pages = readCanvas(design).map((page) => ({
    id: page.id,
    title: page.title,
    boards: page.boards.filter((board) => board && names.includes(board.name)),
  }))
  const assigned = new Set(pages.flatMap((page) => page.boards.map((board) => board.name)))
  const loose = names.filter((name) => !assigned.has(name))
  if (loose.length > 0) {
    const unsorted = unorderedPage(loose, design, pages)
    const page = pages.find((entry) => entry.id === UNSORTED.id)
    if (page) page.boards.push(...unsorted.boards)
    else pages.push(unsorted)
  }

  const data = {
    title,
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      boards: page.boards.map((board) => ({
        name: board.name,
        title: board.title,
        x: board.x,
        y: board.y,
        width: board.width,
        height: board.height,
      })),
    })),
  }

  rmSync(join(out, 'b'), { recursive: true, force: true })
  rmSync(join(out, 'runtime'), { recursive: true, force: true })
  mkdirSync(join(out, 'b'), { recursive: true })

  const missing = []
  for (const name of names) {
    const closure = readClosure(sources, name)
    for (const importName of closure.missing) missing.push(`${name} imports missing ${importName}`)
    writeFileSync(join(out, 'b', `${name}.html`), frameDocument(sources.get(name), name, closure))
  }

  cpSync(runtimeDir, join(out, 'runtime'), { recursive: true })
  copyFileSync(join(ASSETS, 'preview.css'), join(out, 'preview.css'))
  copyFileSync(join(ASSETS, 'preview.js'), join(out, 'preview.js'))

  writeFileSync(join(out, 'data.js'), `window.__IRSIM_PREVIEW__ = ${jsonForScript(data)};\n`)
  writeFileSync(join(out, 'index.html'), indexHtml(title))

  return {
    outDir: out,
    pages: data.pages.length,
    boards: names.length,
    frames: names.length,
    missing: [...new Set(missing)],
  }
}

const indexHtml = (title) => `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="irsim">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%232563eb'/%3E%3Cpath%20d='M9%2022V10h2v12zm12%200V10h2v12zm-8-8h6v4h-6z'%20fill='white'/%3E%3C/svg%3E">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="preview.css">
</head>
<body>
<div class="pv-app" id="pv-app">
<aside class="pv-sidebar" id="pv-sidebar"></aside>
<main class="pv-main" id="pv-main"></main>
</div>
<div class="pv-backdrop" id="pv-backdrop"></div>
<script src="data.js"></script>
<script src="preview.js"></script>
</body>
</html>
`
