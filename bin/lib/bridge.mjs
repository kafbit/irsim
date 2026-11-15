import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { connect } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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

const TOOL_ACTIONS = ['open', 'page', 'comments', 'reply', 'resolve', 'check', 'doctor']

const runTool = async ({ action, ...args }) => {
  if (!TOOL_ACTIONS.includes(action)) {
    throw new Error(`action must be one of ${TOOL_ACTIONS.join(', ')}`)
  }
  if (action === 'doctor') return doctorLines(await runDoctor(args.cwd ?? process.cwd()))
  if (action === 'open') {
    const cwd = args.cwd ?? process.cwd()
    const root = projectRoot(cwd)
    const port = await ensureServer(root)
    const target =
      !args.page && !args.board && args.target ? await resolveTarget(port, args.target) : {}
    const page = args.page ?? target.page
    const board = args.board ?? target.board
    if (args.session) {
      await register(port, { agent: args.agent, session: args.session, cwd }).catch(() => undefined)
    }
    const query = [
      ...(page && board ? [`board=${encodeURIComponent(board)}`] : []),
      ...(args.session ? [`session=${encodeURIComponent(args.session)}`] : []),
    ].join('&')
    const url = `${baseUrl(port)}${page ? `/p/${encodeURIComponent(page)}` : '/'}${query ? `?${query}` : ''}`
    openBrowser(url)
    return `Canvas open at ${url}${args.session ? ', listening for comments.' : '.'}`
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
      return checkLines(await request(port, path, { method: 'POST', timeout: 120_000 }))
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
  if (!(await health(port))) return {}
  if (event === 'SessionStart') {
    if (session) await register(port, { agent: 'codex', session, cwd }).catch(() => undefined)
    return {}
  }
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
  if (!result || !result.count || !result.text) return {}
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

const MCP_TOOL = {
  name: 'design_canvas',
  description:
    'Reads and answers design canvas comments, checks boards, and checks the project. Actions: open, page, comments, reply, resolve, check, doctor. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open', 'page', 'comments', 'reply', 'resolve', 'check', 'doctor'],
      },
      page: { type: 'string', description: 'Page id, for open, page, comments and check.' },
      board: { type: 'string', description: 'Board name, for open and check.' },
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

const mcpServer = async () => {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
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
        reply(id, { tools: [MCP_TOOL] })
      } else if (method === 'tools/call') {
        const args = params?.arguments ?? {}
        if (params?.name !== MCP_TOOL.name) {
          error(id, -32602, `unknown tool ${params?.name}`)
          continue
        }
        try {
          const text = await runTool({
            ...args,
            agent: 'codex',
            ...(process.env.IRSIM_SESSION ? { session: process.env.IRSIM_SESSION } : {}),
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
    if (agent !== 'codex') throw new Error(`no hook adapter for ${agent}`)
    process.stdout.write(`${JSON.stringify(await codexHook(event))}\n`)
    return
  }
  if (command === 'mcp') {
    await mcpServer()
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
          '  leave --session <id>                                   unregister a session',
          '  tool --action <name> [--page] [--board] [--id] [--body] run a design_canvas action',
          '  hook codex <Event>                                     serve one Codex hook (stdin JSON)',
          '  mcp                                                    serve design_canvas over MCP (stdio)',
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
