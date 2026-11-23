import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { constants, homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boardNameOf, listBoards } from './board-file.mjs'

const CONFIG_FILE = '.irsim.json'
const PORT_MIN = 3200
const PORT_COUNT = 100
const START_TIMEOUT_MS = 30_000
const START_STEP_MS = 500
const PROBE_TIMEOUT_MS = 400

export const AGENT_NAMES = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
  'command-code': 'Command Code',
  antigravity: 'Antigravity',
  other: 'Agent',
}

export const normalizeAgent = (value) => {
  if (value === undefined || value === null || value === '') return 'claude-code'
  return typeof value === 'string' && Object.hasOwn(AGENT_NAMES, value) ? value : 'other'
}

export const agentName = (value) => AGENT_NAMES[normalizeAgent(value)]

const fail = (message, code = 1) => {
  const error = new Error(message)
  error.exitCode = code
  throw error
}

const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim()

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...options,
    }).trim()
  } catch {
    return ''
  }
}

const findConfigDir = (from) => {
  let dir = resolve(from)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const gitToplevel = (cwd) => run('git', ['rev-parse', '--show-toplevel'], { cwd }) || null

export const projectRoot = (cwd = process.cwd()) =>
  findConfigDir(cwd) ?? gitToplevel(resolve(cwd)) ?? resolve(cwd)

const validPort = (value) => {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

const hashPort = (root) => {
  let hash = 0x811c9dc5
  for (const char of root) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return PORT_MIN + (hash % PORT_COUNT)
}

const real = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const tcpOpen = (port) =>
  new Promise((done) => {
    const socket = connect({ port, host: 'localhost', timeout: PROBE_TIMEOUT_MS })
    socket.once('connect', () => (socket.destroy(), done(true)))
    socket.once('timeout', () => (socket.destroy(), done(true)))
    socket.once('error', () => done(false))
  })

const probePort = async (port) => {
  if (!(await tcpOpen(port))) return { state: 'free' }
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    const body = await response.json()
    if (body.ok === true && typeof body.root === 'string') return { state: 'canvas', root: body.root }
  } catch {
    return { state: 'busy' }
  }
  return { state: 'busy' }
}

const portFile = (root) => join(root, '.irsim', 'port')

const readRecorded = (root) => {
  try {
    return validPort(readFileSync(portFile(root), 'utf8').trim())
  } catch {
    return null
  }
}

export const canvasPort = async (root, env = process.env) => {
  const forced = validPort(env.IRSIM_PORT || env.DESIGN_PORT)
  if (forced !== null) return forced
  const recorded = readRecorded(root)
  const start = hashPort(root)
  const candidates = [
    ...(recorded ? [recorded] : []),
    ...Array.from(
      { length: PORT_COUNT },
      (_, step) => PORT_MIN + ((start - PORT_MIN + step) % PORT_COUNT),
    ),
  ]
  for (const port of new Set(candidates)) {
    const found = await probePort(port)
    if (found.state === 'free') continue
    if (found.state === 'canvas' && real(found.root) === real(root)) return port
  }
  return forced ?? recorded ?? hashPort(root)
}

const baseUrl = (port) => `http://localhost:${port}`

const request = async (port, path, init = {}) => {
  const url = `${baseUrl(port)}${path}`
  let response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      ...(init.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(init.timeout ?? 10_000),
    })
  } catch {
    throw new Error('the irsim server is not running, run irsim serve')
  }
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  if (!response.ok) {
    const reason = data && typeof data.error === 'string' ? data.error : text
    throw new Error(
      `${init.method ?? 'GET'} ${path} answered ${response.status}${reason ? `: ${oneLine(reason)}` : ''}`,
    )
  }
  return data
}

const health = async (port) => {
  try {
    const response = await fetch(`${baseUrl(port)}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    const body = await response.json()
    return body?.ok === true
  } catch {
    return false
  }
}

const launcher = () => join(dirname(dirname(new URL(import.meta.url).pathname)), 'irsim')

const ensureServer = async (root) => {
  const port = await canvasPort(root)
  if (await health(port)) return port
  try {
    const child = spawn(process.execPath, [launcher(), 'serve'], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  } catch {}
  for (let waited = 0; waited < START_TIMEOUT_MS; waited += START_STEP_MS) {
    await new Promise((done) => setTimeout(done, START_STEP_MS))
    const next = await canvasPort(root)
    if (await health(next)) return next
  }
  throw new Error(`the irsim server did not answer within 30 s in ${root}`)
}

export const labelFor = (root, session, agent) => {
  const short = String(session).slice(0, 6)
  const project = basename(root) || root
  const name = agentName(agent)
  return normalizeAgent(agent) === 'claude-code'
    ? `${project} ${short}`
    : `${name} · ${project} ${short}`
}

const register = async (port, { agent, session, cwd }, env = process.env) => {
  const root = env.IRSIM_ROOT || projectRoot(cwd)
  return request(port, '/api/sessions', {
    method: 'POST',
    body: { id: session, label: labelFor(root, session, agent), cwd, agent: normalizeAgent(agent) },
  })
}

const claim = async (port, session) =>
  request(port, '/api/comments/claim', { method: 'POST', body: { sessionId: session } })

const release = async (port, session, claimed) =>
  request(port, '/api/comments/release', {
    method: 'POST',
    body: {
      sessionId: session,
      comments: (claimed.comments ?? []).map((comment) => comment.id),
      approvals: (claimed.approvals ?? []).map((approval) => approval.id),
      variants: (claimed.variants ?? []).map((one) => one.id),
      pages: (claimed.pages ?? []).map((one) => one.id),
      replies: (claimed.comments ?? []).flatMap((comment) =>
        (comment.newReplies ?? []).map((reply) => ({ comment: comment.id, at: reply.at })),
      ),
    },
  })

const leave = async (port, session) =>
  request(port, `/api/sessions/${encodeURIComponent(session)}`, { method: 'DELETE' })

const pageManifest = async (port, pageId) => {
  const page = await request(port, `/api/pages/${encodeURIComponent(pageId)}`)
  const lines = page.boards.map((board) => {
    const closure =
      board.closure && board.closure.length > 0 ? `  closure: ${board.closure.join(', ')}` : ''
    const variant = board.variantOf
      ? `  variant of ${board.variantOf}: ${board.variantLabel ?? ''}`
      : ''
    const section = board.section ? `  section: ${board.section}` : ''
    return `${board.name}  ${board.width}x${board.height}${closure}${variant}${section}`
  })
  const sections = (page.sections ?? []).map((entry) => {
    const count = page.boards.filter((board) => board.section === entry.id).length
    return `section ${entry.id}: ${entry.title} (${count} ${count === 1 ? 'board' : 'boards'})`
  })
  return [`${page.id}: ${page.title}`, ...sections, ...lines].join('\n')
}

const commentLine = (comment) => {
  const replies = comment.replies.length
  const place = comment.line === 0 ? comment.file : `${comment.file}:${comment.line}`
  const viewport = comment.view ? ` viewport ${comment.view.width}x${comment.view.height}` : ''
  const target = `${comment.line === 0 ? 'board' : comment.element.path} "${comment.element.text}"`
  const tail = replies > 0 ? ` (${replies} ${replies === 1 ? 'reply' : 'replies'})` : ''
  return oneLine(
    `${comment.id} ${comment.status} ${place}${viewport} ${target} ${comment.body}${tail}`,
  )
}

const listComments = async (port, { status, page }) => {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (page) query.set('page', page)
  const suffix = query.toString() ? `?${query}` : ''
  const comments = await request(port, `/api/comments${suffix}`)
  const shown = status ? comments : comments.filter((comment) => comment.status !== 'resolved')
  return shown.length > 0 ? shown.map(commentLine).join('\n') : 'No comments.'
}

const checkLines = (results) => {
  if (results.length === 0) return 'No boards to check.'
  const lines = results.flatMap((result) => {
    const head = `${result.board} ${result.ok ? 'ok' : 'FAIL'} ${result.ms} ms`
    const shot = result.screenshot ? `screenshot: ${result.screenshot}` : 'no screenshot'
    if (result.ok) return [`${head} · ${shot}`]
    return [
      head,
      ...result.errors.map((error) => `  error: ${oneLine(error)}`),
      ...result.warnings.map((warning) => `  warning: ${oneLine(warning)}`),
      `  ${shot}`,
    ]
  })
  const failed = results.filter((result) => !result.ok).length
  if (results.length > 1) lines.push(`${results.length - failed} ok, ${failed} failed`)
  return lines.join('\n')
}

const doctorLines = (report) => {
  const marks = { ok: 'ok', warn: 'warn', fail: 'FAIL', skip: 'skip' }
  const lines = [`irsim doctor: ${report.root}`]
  for (const group of ['config', 'rules', 'git', 'runtime']) {
    const members = report.checks.filter((one) => one.group === group)
    if (members.length === 0) continue
    lines.push(`${group}:`)
    for (const one of members) {
      lines.push(`  ${marks[one.status]} ${one.title} · ${one.detail}`)
      if (one.fix) lines.push(`    fix: ${one.fix}`)
    }
  }
  const { ok, warn, fail, skip } = report.summary
  const parts = [`${ok} ok`]
  if (warn > 0) parts.push(`${warn} warning${warn === 1 ? '' : 's'}`)
  if (fail > 0) parts.push(`${fail} failed`)
  if (skip > 0) parts.push(`${skip} skipped`)
  lines.push(parts.join(', '))
  return lines.join('\n')
}

const lintLines = (report) => {
  const problems = Array.isArray(report?.problems) ? report.problems : []
  if (problems.length === 0) return 'The design folder passes the lint.'
  const lines = problems.map((one) =>
    oneLine(
      `${one.severity} ${one.file} ${one.path} ${one.rule}: ${one.message}${one.fix ? ` (fix: ${one.fix})` : ''}`,
    ),
  )
  const errors = problems.filter((one) => one.severity === 'error').length
  const warnings = problems.length - errors
  lines.push(`${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`)
  return lines.join('\n')
}

const problemLine = (one) =>
  oneLine(`${one.severity} ${one.file} ${one.path} ${one.rule}: ${one.message}${one.fix ? ` (fix: ${one.fix})` : ''}`)

const checkLintLines = (report, checked) => {
  const names = new Set(checked)
  const shown = []
  let other = 0
  for (const one of report.problems) {
    if (one.severity === 'error') shown.push(problemLine(one))
    else if (names.has(boardNameOf(basename(String(one.file))))) shown.push(problemLine(one))
    else other += 1
  }
  if (other > 0) shown.push(`${other} other ${other === 1 ? 'warning' : 'warnings'}, run design_canvas lint to list them`)
  return shown.join('\n')
}

const readLint = async (port) => {
  const report = await request(port, '/api/lint').catch(() => null)
  return report && Array.isArray(report.problems) ? report : null
}

export const runDoctor = async (cwd = process.cwd()) => {
  const { runDoctor: report } = await import(
    pathToFileURL(join(dirname(new URL(import.meta.url).pathname), 'doctor.mjs')).href
  )
  return report({ cwd: projectRoot(cwd), env: { ...process.env, IRSIM_ROOT: projectRoot(cwd) } })
}

const openBrowser = (url) => {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    spawn(command, [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {}
}

const resolveTarget = async (port, wanted) => {
  const name = String(wanted).trim()
  if (!name) return {}
  const pages = await request(port, '/api/pages')
  const page = pages.find((one) => one.id.toLowerCase() === name.toLowerCase())
  if (page) return { page: page.id }
  for (const summary of pages) {
    const detail = await request(port, `/api/pages/${encodeURIComponent(summary.id)}`)
    const board = detail.boards.find((one) => one.name.toLowerCase() === name.toLowerCase())
    if (board) return { page: summary.id, board: board.name }
  }
  const ids = pages.map((one) => one.id).join(', ')
  throw new Error(`no page or board named "${name}", pages: ${ids}`)
}

const TOOL_ACTIONS = ['open', 'stop', 'page', 'comments', 'reply', 'resolve', 'check', 'lint', 'doctor']

/** The actions that read or change the calling session. */
const SESSION_ACTIONS = ['open', 'stop', 'reply', 'resolve']

const runTool = async ({ action, ...args }) => {
  if (!TOOL_ACTIONS.includes(action)) {
    throw new Error(`action must be one of ${TOOL_ACTIONS.join(', ')}`)
  }
  if (action === 'doctor') return doctorLines(await runDoctor(args.cwd ?? process.cwd()))
  if (action === 'stop') {
    const cwd = args.cwd ?? process.cwd()
    const root = projectRoot(cwd)
    const session =
      args.session || (args.agent === 'antigravity' ? readAntigravitySession(root).session : '')
    if (!session) return 'No active irsim session to stop.'
    // Only the Antigravity hooks read the pause; the other agents register again on their next
    // hook, and their `open` cannot find the session to resume it.
    if (args.agent === 'antigravity') pauseSession(root, session)
    const port = await canvasPort(root)
    if (await health(port)) await leave(port, session).catch(() => undefined)
    return 'Stopped listening for irsim comments.'
  }
  if (action === 'open') {
    const cwd = args.cwd ?? process.cwd()
    const root = projectRoot(cwd)
    const port = await ensureServer(root)
    const target =
      !args.page && !args.board && args.target ? await resolveTarget(port, args.target) : {}
    const page = args.page ?? target.page
    const board = args.board ?? target.board
    const session =
      args.session || (args.agent === 'antigravity' ? readAntigravitySession(root).session : '')
    if (session) {
      if (args.agent === 'antigravity') resumeSession(root, session)
      await register(port, { agent: args.agent, session, cwd }).catch(() => undefined)
    }
    const query = [
      ...(page && board ? [`board=${encodeURIComponent(board)}`] : []),
      ...(session ? [`session=${encodeURIComponent(session)}`] : []),
    ].join('&')
    const url = `${baseUrl(port)}${page ? `/p/${encodeURIComponent(page)}` : '/'}${query ? `?${query}` : ''}`
    openBrowser(url)
    return `Canvas open at ${url}${session ? ', listening for comments.' : '.'}`
  }
  const cwd = args.cwd ?? process.cwd()
  const root = projectRoot(cwd)
  const port = await canvasPort(root)
  if (!(await health(port))) throw new Error('the irsim server is not running, run irsim serve')
  switch (action) {
    case 'page':
      if (!args.page) throw new Error('page needs --page')
      return pageManifest(port, args.page)
    case 'comments':
      return listComments(port, args)
    case 'reply':
      if (!args.id || !args.body) throw new Error('reply needs --id and --body')
      await request(port, `/api/comments/${encodeURIComponent(args.id)}/reply`, {
        method: 'POST',
        body: {
          author: 'claude',
          body: args.body,
          ...(args.session ? { session: args.session } : {}),
        },
      })
      return `Replied to ${args.id}.`
    case 'resolve':
      if (!args.id) throw new Error('resolve needs --id')
      if (args.body) {
        await request(port, `/api/comments/${encodeURIComponent(args.id)}/reply`, {
          method: 'POST',
          body: {
            author: 'claude',
            body: args.body,
            ...(args.session ? { session: args.session } : {}),
          },
        })
      }
      await request(port, `/api/comments/${encodeURIComponent(args.id)}`, {
        method: 'PATCH',
        body: { status: 'resolved' },
      })
      return `Resolved ${args.id}.`
    case 'check': {
      if (!args.board && !args.page) throw new Error('check needs --board or --page')
      const path = args.board
        ? `/api/boards/${encodeURIComponent(args.board)}/check`
        : `/api/pages/${encodeURIComponent(args.page)}/check`
      const lint = await readLint(port)
      const checked = await request(port, path, { method: 'POST', timeout: 120_000 })
      const results = checkLines(checked)
      if (!lint) return results
      const problems = checkLintLines(lint, checked.map((one) => boardNameOf(one.board)))
      return problems === '' ? results : `Format problems:\n${problems}\n${results}`
    }
    case 'lint': {
      const report = await request(port, '/api/lint')
      return lintLines(report)
    }
  }
  throw new Error(`unknown action ${action}`)
}

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const parseHookInput = async () => {
  try {
    const text = await readStdin()
    return text.trim() ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

const SESSION_CONTEXT =
  'This project keeps its screens as irsim boards. Load the `irsim-design` skill before you create or edit a board file or design/canvas.json, and the `irsim-workflow` skill before you change what a screen shows. Run `irsim lint` and design_canvas check before you say you are done.'

const LINT_REPORTS_PER_SESSION = 2

const lintReportFile = (root, session) =>
  join(root, '.irsim', 'lint-reports', String(session).replace(/[^A-Za-z0-9_-]/g, '_'))

const lintReportCount = (root, session) => {
  try {
    return Number(readFileSync(lintReportFile(root, session), 'utf8')) || 0
  } catch {
    return 0
  }
}

const countLintReport = (root, session) => {
  try {
    const file = lintReportFile(root, session)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, String(lintReportCount(root, session) + 1))
  } catch {}
}

const designFolder = (root) => {
  const override = process.env.IRSIM_DESIGN_DIR || process.env.CANVAS_DESIGN_DIR
  if (override) return resolve(root, override)
  try {
    const value = JSON.parse(readFileSync(join(root, CONFIG_FILE), 'utf8'))?.designDir
    return resolve(root, typeof value === 'string' && value ? value : 'design')
  } catch {
    return join(root, 'design')
  }
}

const newestDesignMtime = (root) => {
  const dir = designFolder(root)
  const files = [join(dir, 'canvas.json'), ...listBoards(dir).map((board) => join(dir, board.file))]
  let newest = 0
  for (const file of files) {
    try {
      newest = Math.max(newest, statSync(file).mtimeMs)
    } catch {}
  }
  return newest
}

const startMarkFile = (root, session) => `${lintReportFile(root, session)}.mtime`

const recordDesignStart = (root, session) => {
  try {
    const file = startMarkFile(root, session)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, String(newestDesignMtime(root)))
  } catch {}
}

const designChangedSinceStart = (root, session) => {
  try {
    const recorded = Number(readFileSync(startMarkFile(root, session), 'utf8'))
    return Number.isFinite(recorded) && newestDesignMtime(root) > recorded
  } catch {
    return false
  }
}

/**
 * Codex hook: register on start, deliver comments before a model request, on a user prompt and
 * when the agent stops. Every path prints one JSON object for Codex to read, or nothing.
 */
const codexHook = async (event) => {
  const payload = await parseHookInput()
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  const session =
    payload.session_id ||
    payload.sessionId ||
    payload.thread_id ||
    (typeof payload.transcript_path === 'string'
      ? basename(payload.transcript_path).replace(/\.jsonl$/, '')
      : '') ||
    process.env.IRSIM_SESSION
  const root = projectRoot(cwd)
  const port = await canvasPort(root)
  const healthy = await health(port)
  if (event === 'SessionStart') {
    if (!existsSync(join(root, CONFIG_FILE)) && !existsSync(join(designFolder(root), 'canvas.json'))) return {}
    if (session) {
      if (healthy) await register(port, { agent: 'codex', session, cwd }).catch(() => undefined)
      recordDesignStart(root, session)
    }
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: SESSION_CONTEXT } }
  }
  if (!healthy) return {}
  if (!session) return {}
  if (event === 'SessionEnd') {
    await leave(port, session).catch(() => undefined)
    return {}
  }
  // A canvas started after the session began has no session yet; register before claiming so
  // the session keeps its label and agent.
  await register(port, { agent: 'codex', session, cwd }).catch(() => undefined)
  if (event === 'Stop' && payload.stop_hook_active === true) return {}
  const result = await claim(port, session).catch(() => null)
  if (!result || !result.count || !result.text) {
    if (event !== 'Stop' || lintReportCount(root, session) >= LINT_REPORTS_PER_SESSION) return {}
    if (!designChangedSinceStart(root, session)) return {}
    const lint = await readLint(port)
    if (!lint || !lint.problems.some((one) => one.severity === 'error')) return {}
    countLintReport(root, session)
    return { decision: 'block', reason: `${lintLines(lint)}\nFix these, then stop.` }
  }
  const text = result.text
  if (event === 'Stop') {
    return { decision: 'block', reason: text }
  }
  if (event === 'UserPromptSubmit' || event === 'PreModelRequest') {
    return {
      hookSpecificOutput: { hookEventName: event, additionalContext: text },
    }
  }
  return {}
}

const safeSessionKey = (session) => String(session).replace(/[^A-Za-z0-9_-]/g, '_')

/** A session stopped with the `stop` action stays paused until `open` resumes it. */
const pausedFile = (root, session) => join(root, '.irsim', 'paused', safeSessionKey(session))

const pauseSession = (root, session) => {
  try {
    const file = pausedFile(root, session)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '1')
  } catch {}
}

const resumeSession = (root, session) => {
  try {
    rmSync(pausedFile(root, session), { force: true })
  } catch {}
}

const isPaused = (root, session) => existsSync(pausedFile(root, session))

/** The parent chain of this process, nearest first, as `{ pid, name }`. Empty when unknown. */
const ancestors = () => {
  const chain = []
  try {
    if (process.platform === 'linux') {
      let pid = process.ppid
      while (pid > 1 && chain.length < 16) {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        const close = stat.lastIndexOf(')')
        const name = stat.slice(stat.indexOf('(') + 1, close)
        chain.push({ pid, name })
        pid = Number(stat.slice(close + 2).split(' ')[1])
      }
      return chain
    }
    if (process.platform === 'win32') return chain
    const parents = new Map()
    for (const line of run('ps', ['-A', '-o', 'pid=,ppid=,comm=']).split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
      if (match) parents.set(Number(match[1]), { ppid: Number(match[2]), name: basename(match[3]) })
    }
    let pid = process.ppid
    while (pid > 1 && chain.length < 16 && parents.has(pid)) {
      const one = parents.get(pid)
      chain.push({ pid, name: one.name })
      pid = one.ppid
    }
  } catch {}
  return chain
}

let antigravityPidCache
/**
 * The pid of the Antigravity CLI that runs this hook or MCP server. Hooks and the MCP server
 * of one agy process share it, so it keys the session of that process. IRSIM_ANTIGRAVITY_PID
 * overrides it, for tests.
 */
const antigravityPid = () => {
  if (process.env.IRSIM_ANTIGRAVITY_PID) return process.env.IRSIM_ANTIGRAVITY_PID
  if (antigravityPidCache === undefined) {
    const owner = ancestors().find(({ name }) => /^(agy|antigravity)(\.exe)?$/i.test(name))
    antigravityPidCache = owner ? String(owner.pid) : ''
  }
  return antigravityPidCache
}

const cacheDir = () =>
  process.env.IRSIM_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'irsim')

/**
 * Where the hooks of this agy process write its conversation. With an agy parent the file is
 * keyed by its pid in the cache dir, so the MCP server finds it whatever its own working folder
 * is. Without one it falls back to one file per project.
 */
const antigravitySessionFile = (root) => {
  const pid = antigravityPid()
  return pid
    ? join(cacheDir(), 'antigravity-sessions', safeSessionKey(pid))
    : join(root, '.irsim', 'antigravity-session')
}

const rememberAntigravitySession = (root, session) => {
  try {
    const file = antigravitySessionFile(root)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ session: String(session), root }))
  } catch {}
}

/**
 * The conversation of this agy process and its project root. The hooks see every new
 * conversation, so what they wrote comes first; ANTIGRAVITY_CONVERSATION_ID is only a fallback,
 * because it is fixed when agy starts the process.
 */
const readAntigravitySession = (root) => {
  try {
    const saved = JSON.parse(readFileSync(antigravitySessionFile(root), 'utf8'))
    if (saved && typeof saved.session === 'string' && saved.session) {
      return { session: saved.session, root: typeof saved.root === 'string' && saved.root ? saved.root : root }
    }
  } catch {}
  return { session: process.env.ANTIGRAVITY_CONVERSATION_ID || '', root }
}

/** Removes the file of this agy process when it exits, so a reused pid does not read it. */
const forgetAntigravitySession = () => {
  const pid = antigravityPid()
  if (!pid) return
  try {
    rmSync(join(cacheDir(), 'antigravity-sessions', safeSessionKey(pid)), { force: true })
  } catch {}
}

/**
 * Antigravity CLI hook: register on start, deliver comments before a model invocation and
 * when the execution loop stops. Every path prints one JSON object for Antigravity to read.
 */
const antigravityHook = async (event) => {
  const payload = await parseHookInput()
  const cwd =
    typeof payload.cwd === 'string' && payload.cwd
      ? payload.cwd
      : Array.isArray(payload.workspacePaths) && typeof payload.workspacePaths[0] === 'string'
        ? payload.workspacePaths[0]
        : process.cwd()
  const session =
    payload.conversationId ||
    payload.session_id ||
    payload.sessionId ||
    process.env.IRSIM_SESSION
  const root = projectRoot(cwd)
  const port = await canvasPort(root)
  const healthy = await health(port)
  if (event === 'SessionStart') {
    if (!existsSync(join(root, CONFIG_FILE)) && !existsSync(join(designFolder(root), 'canvas.json'))) return {}
    if (session) {
      rememberAntigravitySession(root, session)
      if (healthy && !isPaused(root, session)) {
        await register(port, { agent: 'antigravity', session, cwd }).catch(() => undefined)
      }
      recordDesignStart(root, session)
    }
    return {
      injectSteps: [{ systemMessage: { systemMessage: SESSION_CONTEXT } }],
    }
  }
  if (!healthy || !session) return {}
  rememberAntigravitySession(root, session)
  if (isPaused(root, session)) return {}
  await register(port, { agent: 'antigravity', session, cwd }).catch(() => undefined)
  if (event === 'PreInvocation') {
    const result = await claim(port, session).catch(() => null)
    if (!result || !result.count || !result.text) return {}
    return {
      injectSteps: [{ systemMessage: { systemMessage: result.text } }],
    }
  }
  if (event === 'Stop') {
    if (payload.continuationActive === true) return {}
    if (
      typeof payload.terminationReason === 'string' &&
      payload.terminationReason &&
      payload.terminationReason !== 'NO_TOOL_CALL'
    ) {
      return {}
    }
    const result = await claim(port, session).catch(() => null)
    if (result && result.count && result.text) {
      return { decision: 'continue', reason: result.text }
    }
    if (lintReportCount(root, session) >= LINT_REPORTS_PER_SESSION) return {}
    if (!designChangedSinceStart(root, session)) return {}
    const lint = await readLint(port)
    if (!lint || !lint.problems.some((one) => one.severity === 'error')) return {}
    countLintReport(root, session)
    return { decision: 'continue', reason: `${lintLines(lint)}\nFix these, then stop.` }
  }
  return {}
}

/** The design_canvas tool. `stop` is listed only for an agent whose MCP server knows its session. */
const mcpTool = (agent) => {
  const actions = TOOL_ACTIONS.filter((one) => one !== 'stop' || agent === 'antigravity')
  return {
    name: 'design_canvas',
    description:
      `Reads and answers design canvas comments, checks boards, lints the design folder, and checks the project. Actions: ${actions.join(', ')}. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at, after the format problems of the design folder. lint lists the format problems of the board files and design/canvas.json. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: actions,
        },
        page: { type: 'string', description: 'Page id, for open, page, comments and check.' },
        board: { type: 'string', description: 'Board name, for open and check.' },
        target: { type: 'string', description: 'Page id or board name to resolve, for open.' },
        status: {
          type: 'string',
          enum: ['draft', 'queued', 'delivered', 'resolved'],
          description: 'Filter for comments.',
        },
        id: { type: 'string', description: 'Comment id, for reply and resolve.' },
        body: {
          type: 'string',
          description:
            'Reply text, for reply and resolve. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
        },
      },
      required: ['action'],
    },
  }
}

const mcpServer = async (agent = 'codex') => {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
  const tool = mcpTool(agent)
  const roots = new Map()
  const rootOf = (cwd) => {
    if (!roots.has(cwd)) roots.set(cwd, projectRoot(cwd))
    return roots.get(cwd)
  }
  const actions = tool.inputSchema.properties.action.enum
  // The session and project the hooks of this agy process wrote. With an agy pid the file does
  // not depend on the project, so no action needs projectRoot; without one only the session
  // actions look it up.
  const contextFor = (args) => {
    if (agent !== 'antigravity') return { session: process.env.IRSIM_SESSION || '' }
    if (!antigravityPid() && !SESSION_ACTIONS.includes(args.action)) {
      return { session: process.env.IRSIM_SESSION || '' }
    }
    const found = readAntigravitySession(rootOf(args.cwd ?? process.cwd()))
    return { session: process.env.IRSIM_SESSION || found.session, root: found.root }
  }
  // Antigravity has no session end hook. Its MCP server lives as long as the agy process, so
  // stdin closing or a stop signal means agy exited: take the session off the canvas.
  // After a signal agy may kill the process soon, so that path skips the port scan and the
  // health check: it uses the forced or recorded port and gives the DELETE one second.
  let leaving
  const leaveOnExit = ({ fast = false } = {}) => {
    leaving ??= (async () => {
      if (agent !== 'antigravity') return
      const { session, root } = readAntigravitySession(rootOf(process.cwd()))
      if (session) {
        if (fast) {
          const port = validPort(process.env.IRSIM_PORT || process.env.DESIGN_PORT) ?? readRecorded(root)
          if (port !== null) {
            await request(port, `/api/sessions/${encodeURIComponent(session)}`, {
              method: 'DELETE',
              timeout: 1_000,
            }).catch(() => undefined)
          }
        } else {
          const port = await canvasPort(root)
          if (await health(port)) await leave(port, session).catch(() => undefined)
        }
      }
      forgetAntigravitySession()
    })()
    return leaving
  }
  if (agent === 'antigravity') {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      process.once(signal, () => {
        leaveOnExit({ fast: true }).finally(() => process.exit(128 + constants.signals[signal]))
      })
    }
  }
  let buffer = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      const { id, method, params } = message
      if (method === 'initialize') {
        reply(id, {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'irsim', version: '1' },
        })
      } else if (method === 'notifications/initialized') {
        continue
      } else if (method === 'ping') {
        reply(id, {})
      } else if (method === 'tools/list') {
        reply(id, { tools: [tool] })
      } else if (method === 'tools/call') {
        const args = params?.arguments ?? {}
        if (params?.name !== tool.name) {
          error(id, -32602, `unknown tool ${params?.name}`)
          continue
        }
        try {
          if (!actions.includes(args.action)) {
            throw new Error(`action must be one of ${actions.join(', ')}`)
          }
          const { session, root } = contextFor(args)
          const text = await runTool({
            ...args,
            ...(root && !args.cwd ? { cwd: root } : {}),
            agent,
            ...(session ? { session } : {}),
          })
          reply(id, { content: [{ type: 'text', text }] })
        } catch (failure) {
          reply(id, { content: [{ type: 'text', text: `irsim: ${failure.message}` }], isError: true })
        }
      } else if (typeof id !== 'undefined') {
        error(id, -32601, `unknown method ${method}`)
      }
    }
  }
  await leaveOnExit()
}

const parse = (args) => {
  const flags = { _: [] }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      flags._.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2)
    const value = inline ?? args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      flags[name] = true
      continue
    }
    if (inline === undefined) index++
    flags[name] = value
  }
  return flags
}

export const runBridge = async (args) => {
  const [command = 'help', ...rest] = args
  const flags = parse(rest)
  const cwd = typeof flags.cwd === 'string' ? resolve(flags.cwd) : process.cwd()
  if (command === 'hook') {
    const [agent = 'other', event = ''] = flags._
    if (agent === 'codex') {
      process.stdout.write(`${JSON.stringify(await codexHook(event))}\n`)
      return
    }
    if (agent === 'antigravity') {
      process.stdout.write(`${JSON.stringify(await antigravityHook(event))}\n`)
      return
    }
    throw new Error(`no hook adapter for ${agent}`)
  }
  if (command === 'mcp') {
    await mcpServer(typeof flags.agent === 'string' ? normalizeAgent(flags.agent) : 'codex')
    return
  }
  if (command === 'doctor') {
    const report = await runDoctor(cwd)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
    return
  }
  if (command === 'tool') {
    const text = await runTool({
      action: typeof flags.action === 'string' ? flags.action : String(flags._[0] ?? ''),
      agent: flags.agent,
      session: flags.session,
      cwd,
      page: flags.page,
      board: flags.board,
      target: flags.target,
      status: flags.status,
      id: flags.id,
      body: flags.body,
    })
    console.log(text)
    return
  }

  const root = projectRoot(cwd)
  const port = await canvasPort(root)
  if (!(await health(port))) throw new Error('the irsim server is not running, run irsim serve')
  const session = typeof flags.session === 'string' ? flags.session : process.env.IRSIM_SESSION
  switch (command) {
    case 'register':
      if (!session) throw new Error('register needs --session')
      console.log(JSON.stringify(await register(port, { agent: flags.agent, session, cwd })))
      return
    case 'claim': {
      if (!session) throw new Error('claim needs --session')
      const result = await claim(port, session)
      if (flags.json) console.log(JSON.stringify(result))
      else if (result.text) console.log(result.text)
      return
    }
    case 'release': {
      if (!session) throw new Error('release needs --session')
      if (typeof flags.claim !== 'string') throw new Error('release needs --claim <claim json>')
      await release(port, session, JSON.parse(flags.claim))
      return
    }
    case 'leave':
      if (!session) throw new Error('leave needs --session')
      await leave(port, session)
      return
    case 'url':
      console.log(baseUrl(port))
      return
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(
        [
          'irsim bridge: connect an agent harness to the canvas',
          '',
          'usage: irsim bridge <command> [options]',
          '',
          'commands:',
          '  register --session <id> [--agent <id>] [--cwd <dir>]   register a session',
          '  claim --session <id> [--json]                          claim queued comments',
          '  release --session <id> --claim <json>                  put a claim that was not delivered back',
          '  leave --session <id>                                   unregister a session',
          '  tool --action <name> [--page] [--board] [--id] [--body] run a design_canvas action (open, stop, page, comments, reply, resolve, check, lint, doctor)',
          '  hook codex <Event>                                     serve one Codex hook (stdin JSON)',
          '  hook antigravity <Event>                               serve one Antigravity hook (stdin JSON)',
          '  mcp [--agent <id>]                                     serve design_canvas over MCP (stdio)',
          '  doctor                                                 print the doctor report',
          '  url                                                    print the canvas URL',
        ].join('\n'),
      )
      return
    default:
      fail(`unknown bridge command ${command}`, 2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBridge(process.argv.slice(2)).catch((error) => {
    console.error(`irsim: ${error.message}`)
    process.exit(error.exitCode ?? 1)
  })
}
