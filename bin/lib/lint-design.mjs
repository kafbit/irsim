import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardFileName, listBoards } from './board-file.mjs'

const NAME = /^[A-Za-z][A-Za-z0-9]*$/
const ICON = /^[a-z0-9]+(-[a-z0-9]+)*$/
const COLORS = ['gray', 'blue', 'green', 'amber', 'purple', 'red']
const MIN_WIDTH = 240
const MIN_HEIGHT = 160
const MAX_DEPTH = 3
const DEFAULT_SIZE = { width: 1440, height: 900 }
const FIX_BUILD = 'run irsim lint --fix'

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** The title and preview size of a board source. Throws when the `data-props` JSON does not parse. */
export const readBoardMeta = (source) => {
  const title = decode(/<title>([^<]*)<\/title>/.exec(source)?.[1] ?? '').trim()
  const attribute = /<script[^>]*type="text\/x-dc"[^>]*data-props=(?:'([^']*)'|"([^"]*)")/.exec(source)
  const raw = attribute?.[1] ?? attribute?.[2]
  const props = raw ? JSON.parse(decode(raw)) : {}
  return {
    title,
    width: props.$preview?.width ?? DEFAULT_SIZE.width,
    height: props.$preview?.height ?? DEFAULT_SIZE.height,
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const lintCanvas = (designDir, boards, add) => {
  const file = 'canvas.json'
  const path = join(designDir, file)
  if (!existsSync(path)) {
    if (boards.length > 0) {
      add('warning', file, '', 'canvas-json-missing', 'canvas.json does not exist but boards do', 'run irsim build')
    }
    return
  }
  let canvas
  try {
    canvas = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    add(
      'error',
      file,
      '',
      'canvas-json-invalid',
      `canvas.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      'fix the JSON syntax, or delete canvas.json and run irsim build',
    )
    return
  }
  if (!isObject(canvas)) {
    add('error', file, '', 'canvas-json-invalid', 'canvas.json must hold a JSON object', 'write {"version":1,"pages":[]} or run irsim build')
    return
  }
  if (canvas.version !== 1) {
    add('warning', file, 'version', 'canvas-version', `version is ${JSON.stringify(canvas.version)}, expected 1`, 'set "version": 1')
  }
  if (!Array.isArray(canvas.pages)) {
    add('error', file, 'pages', 'canvas-json-invalid', 'pages must be an array', 'set "pages" to an array of pages')
    return
  }
  const pageIds = new Set()
  const listed = new Map()
  canvas.pages.forEach((page, p) => {
    const at = `pages[${p}]`
    if (!isObject(page)) {
      add('error', file, at, 'canvas-json-invalid', 'a page must be a JSON object', 'replace it with {"id","title","boards"}')
      return
    }
    if (typeof page.id !== 'string' || page.id === '') {
      add('error', file, `${at}.id`, 'page-id-duplicate', 'page id must be a non-empty string', 'give the page a unique id')
    } else if (pageIds.has(page.id)) {
      add('error', file, `${at}.id`, 'page-id-duplicate', `page id "${page.id}" is used twice`, 'give every page its own id')
    } else pageIds.add(page.id)
    if (!isText(page.title)) {
      add('error', file, `${at}.title`, 'page-title', 'page title must be a non-empty string', 'set a title text')
    }
    if (page.icon !== undefined && !(typeof page.icon === 'string' && ICON.test(page.icon))) {
      add('warning', file, `${at}.icon`, 'page-icon', 'page icon must be a Lucide icon name in kebab-case', 'use a name such as "layout-dashboard" or remove icon')
    }
    const sectionIds = lintSections(file, at, page.sections, add)
    const boardList = Array.isArray(page.boards) ? page.boards : []
    boardList.forEach((board, b) => {
      const spot = `${at}.boards[${b}]`
      if (!isObject(board)) {
        add('error', file, spot, 'board-name', 'a board must be a JSON object', 'replace it with {"name","title","x","y","width","height"}')
        return
      }
      const name = board.name
      if (typeof name !== 'string' || !NAME.test(name)) {
        add('error', file, `${spot}.name`, 'board-name', `board name ${JSON.stringify(name)} must match ${NAME.source}`, 'use letters and digits, starting with a letter')
      } else {
        if (boardFileName(designDir, name) === null) {
          add('error', file, `${spot}.name`, 'board-file-missing', `board ${name} has no ${name}.html file`, `create ${name}.html or remove the board from canvas.json`)
        }
        if (listed.has(name)) {
          add('error', file, `${spot}.name`, 'board-duplicate', `board ${name} is also listed at ${listed.get(name)}`, 'list each board once')
        } else listed.set(name, spot)
      }
      if (!isText(board.title)) {
        add('error', file, `${spot}.title`, 'board-title', 'board title must be a non-empty string', FIX_BUILD)
      }
      for (const key of ['x', 'y', 'width', 'height']) {
        if (!isNumber(board[key])) {
          add('error', file, `${spot}.${key}`, 'board-rect', `${key} must be a finite number`, FIX_BUILD)
        } else if ((key === 'width' || key === 'height') && board[key] <= 0) {
          add('error', file, `${spot}.${key}`, 'board-rect', `${key} must be greater than 0`, FIX_BUILD)
        } else if (key === 'width' && board[key] < MIN_WIDTH) {
          add('warning', file, `${spot}.${key}`, 'board-rect', `width is under ${MIN_WIDTH}, the smallest size a resize on the canvas allows`, `set width to ${MIN_WIDTH} or more unless the board is a small part`)
        } else if (key === 'height' && board[key] < MIN_HEIGHT) {
          add('warning', file, `${spot}.${key}`, 'board-rect', `height is under ${MIN_HEIGHT}, the smallest size a resize on the canvas allows`, `set height to ${MIN_HEIGHT} or more unless the board is a small part`)
        }
      }
      if (board.section !== undefined && !sectionIds.has(board.section)) {
        add('error', file, `${spot}.section`, 'section-missing', `section ${JSON.stringify(board.section)} is not in the sections of page ${page.id}`, 'add the section to the page or remove the board section')
      }
    })
  })
  for (const board of boards) {
    if (!listed.has(board.name)) {
      add('warning', board.file, '', 'board-unlisted', `${board.file} is not listed on any page of canvas.json`, 'run irsim build')
    }
  }
}

const lintSections = (file, at, sections, add) => {
  const ids = new Set()
  if (sections === undefined) return ids
  if (!Array.isArray(sections)) {
    add('error', file, `${at}.sections`, 'section-id-duplicate', 'sections must be an array', 'set sections to an array or remove it')
    return ids
  }
  const parents = new Map()
  sections.forEach((section, s) => {
    const spot = `${at}.sections[${s}]`
    if (!isObject(section)) {
      add('error', file, spot, 'section-title', 'a section must be a JSON object', 'replace it with {"id","title"}')
      return
    }
    if (typeof section.id !== 'string' || section.id === '') {
      add('error', file, `${spot}.id`, 'section-id-duplicate', 'section id must be a non-empty string', 'give the section a unique id')
    } else if (ids.has(section.id)) {
      add('error', file, `${spot}.id`, 'section-id-duplicate', `section id "${section.id}" is used twice on the page`, 'give every section its own id')
    } else {
      ids.add(section.id)
      parents.set(section.id, section.parent)
    }
    if (!isText(section.title)) {
      add('error', file, `${spot}.title`, 'section-title', 'section title must be a non-empty string', 'set a title text')
    }
    if (section.color !== undefined && !COLORS.includes(section.color)) {
      add('error', file, `${spot}.color`, 'section-color', `color ${JSON.stringify(section.color)} is not one of ${COLORS.join(', ')}`, `use one of ${COLORS.join(', ')}`)
    }
    const keys = ['x', 'y', 'width', 'height']
    const present = keys.filter((key) => section[key] !== undefined)
    if (present.length > 0 && !keys.every((key) => isNumber(section[key]))) {
      add('error', file, spot, 'section-area', 'x, y, width and height must be all four finite numbers or none', 'set all four or remove them')
    }
  })
  sections.forEach((section, s) => {
    if (!isObject(section) || section.parent === undefined) return
    const spot = `${at}.sections[${s}].parent`
    if (!parents.has(section.parent)) {
      add('error', file, spot, 'section-parent-missing', `parent ${JSON.stringify(section.parent)} is not a section of this page`, 'use an existing section id or remove parent')
      return
    }
    const seen = new Set([section.id])
    let depth = 1
    let current = section.parent
    while (current !== undefined && parents.has(current)) {
      if (seen.has(current)) {
        add('error', file, spot, 'section-cycle', `section ${section.id} is its own ancestor`, 'remove one parent link in the cycle')
        return
      }
      seen.add(current)
      depth += 1
      current = parents.get(current)
    }
    if (depth > MAX_DEPTH) {
      add('error', file, spot, 'section-depth', `section ${section.id} is nested ${depth} levels, the limit is ${MAX_DEPTH}`, `nest at most ${MAX_DEPTH} levels`)
    }
  })
  return ids
}

const boardLanguage = (designDir) => {
  try {
    const value = JSON.parse(readFileSync(join(designDir, '..', '.irsim.json'), 'utf8'))?.boardLanguage
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

const lintBoardFiles = (designDir, boards, add) => {
  const language = boardLanguage(designDir)
  const names = new Set(boards.map((board) => board.name))
  for (const board of boards) {
    const { file, name } = board
    if (board.legacy) {
      add('warning', file, '', 'board-legacy-name', `${file} uses the legacy .dc.html name`, 'irsim lint --fix renames it to .html')
    } else if (existsSync(join(designDir, `${name}.dc.html`))) {
      add('warning', file, '', 'board-both-forms', `${name}.html and ${name}.dc.html both exist, ${name}.html is used`, `delete ${name}.dc.html`)
    }
    let source
    try {
      source = readFileSync(join(designDir, file), 'utf8')
    } catch (error) {
      add('error', file, '', 'board-script', `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`, 'check the file permissions')
      continue
    }
    const title = decode(/<title>([^<]*)<\/title>/.exec(source)?.[1] ?? '').trim()
    if (title === '') {
      add('error', file, '', 'board-title-tag', `${file} has no non-empty <title>`, 'add <title>Board title</title> to the head')
    }
    const attribute = /<script[^>]*type="text\/x-dc"[^>]*data-props=(?:'([^']*)'|"([^"]*)")/.exec(source)
    const raw = attribute?.[1] ?? attribute?.[2]
    if (raw === undefined) {
      add('error', file, '', 'board-script', `${file} has no <script type="text/x-dc" data-props="..."> element`, 'add the text/x-dc script with a data-props JSON')
    } else {
      try {
        const props = JSON.parse(decode(raw))
        const preview = props?.$preview
        if (!isNumber(preview?.width) || !isNumber(preview?.height)) {
          add('warning', file, '', 'board-preview', `$preview.width or $preview.height is missing in ${file}, 1440x900 is used`, 'add "$preview":{"width":1440,"height":900} to data-props')
        }
      } catch (error) {
        add('error', file, '', 'board-script', `data-props of ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, 'fix the JSON in data-props')
      }
    }
    for (const match of source.matchAll(/<dc-import\b[^>]*\bname=["']([^"']*)["']/g)) {
      const target = match[1]
      if (!names.has(target) && boardFileName(designDir, target) === null) {
        add('error', file, '', 'board-import-missing', `${file} imports ${target}, which has no board file`, `create ${target}.html or remove the dc-import`)
      }
    }
    if (language === 'en') {
      const tag = /<html\b[^>]*>/i.exec(source)?.[0] ?? ''
      if (!/\blang=["']en["']/.test(tag) || !/\bdir=["']ltr["']/.test(tag)) {
        add('warning', file, '', 'board-root-lang', `the <html> tag of ${file} lacks lang="en" dir="ltr"`, 'write <html lang="en" dir="ltr">')
      }
    }
  }
}

/** Checks the design folder and returns every problem found; `ok` is false when one is an error. */
export const lintDesign = (designDir) => {
  const problems = []
  const add = (severity, file, path, rule, message, fix) =>
    problems.push({ severity, file, path, rule, message, fix })
  const boards = listBoards(designDir)
  lintCanvas(designDir, boards, add)
  lintBoardFiles(designDir, boards, add)
  problems.sort((a, b) =>
    a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )
  return { ok: !problems.some((problem) => problem.severity === 'error'), problems }
}
