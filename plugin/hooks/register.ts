import type { Register } from 'claude-code'
import { api, doctorLines, lintLines, listenKey, messageOf, registerSession, runDoctor } from './api'
import type { Engine, LintReport } from './api'
import { commentCounts, openCanvas, stopCanvas } from './canvas'
import { setTurnRunning, stopPolling, syncPoll } from './poll'
import { TOOL_DESCRIPTION, TOOL_MATCH, TOOL_NAME, TOOL_SCHEMA, runTool } from './tool'

const SESSION_CONTEXT =
  'This project keeps its screens as irsim boards. Load the `irsim-design` skill before you create or edit a board file or design/canvas.json, and the `irsim-workflow` skill before you change what a screen shows. Run `irsim lint` and design_canvas check before you say you are done.'

const LINT_REPORTS_PER_SESSION = 2
const WRITE_TOOLS = /^(Write|Edit|MultiEdit)$/
const designWrites = new Map<string, Set<string>>()
const lintReports = new Map<string, number>()
let designFolder: string | null = null
let irsimProject = false

const parentOf = (dir: string): string => {
  const cut = dir.lastIndexOf('/')
  return cut <= 0 ? '/' : dir.slice(0, cut)
}

const resolvePath = (base: string, path: string): string => {
  const parts: string[] = path.startsWith('/') ? [] : base.split('/').filter(Boolean)
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

async function findDesignFolder($: Engine, cwd: string): Promise<string | null> {
  try {
    let dir = resolvePath('/', cwd)
    for (;;) {
      const config = `${dir === '/' ? '' : dir}/.irsim.json`
      if (await $.fs.exists(config)) {
        let designDir = 'design'
        try {
          const value = JSON.parse(await $.fs.read(config))?.designDir
          if (typeof value === 'string' && value) designDir = value
        } catch {}
        return resolvePath(dir, designDir)
      }
      if (dir === '/') break
      dir = parentOf(dir)
    }
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
    const root = top.exitCode === 0 && top.stdout.trim() ? top.stdout.trim() : cwd
    return (await $.fs.exists(`${root}/design/canvas.json`)) ? resolvePath(root, 'design') : null
  } catch {
    return null
  }
}

const isDesignFile = (path: unknown): path is string =>
  typeof path === 'string' &&
  designFolder !== null &&
  path.startsWith(`${designFolder}/`) &&
  (path.endsWith('canvas.json') || path.endsWith('.html'))

export const register: Register = (on) => {
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!irsimProject) return result
    return {
      sections: [...result.sections, { id: 'irsim:design', text: SESSION_CONTEXT, scope: 'session' }],
    }
  })

  on('session.start', async ($, e, next) => {
    setTurnRunning(false)
    const started = await next(e)
    designFolder = await findDesignFolder($, e.cwd)
    irsimProject = designFolder !== null
    await $.command.register({
      name: 'irsim',
      description: 'Open irsim and listen for its comments',
      argumentHint: '[page or board]',
      immediate: true,
    })
    await $.command.register({
      name: 'irsim-stop',
      description: 'Stop listening for irsim comments',
      immediate: true,
    })
    await $.command.register({
      name: 'irsim-comments',
      description: 'Count the open irsim comments per page',
      immediate: true,
    })
    await $.command.register({
      name: 'irsim-doctor',
      description: 'Check the project rules, git setup and config',
      immediate: true,
    })
    await $.tool
      .register({
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: TOOL_SCHEMA,
        isDeferred: false,
      })
      .catch((error: unknown) =>
        $.ui.log(`irsim: tool not registered, ${messageOf(error)}`),
      )
    const sessionId = await $.session.id()
    if (await $.store.get(listenKey(sessionId))) {
      await registerSession($, e.cwd, sessionId).catch(() => undefined)
      await syncPoll($)
    }
    return started
  })

  on('command.run', { command: ['irsim', 'irsim-stop', 'irsim-comments', 'irsim-doctor'] }, async ($, e) => {
    try {
      if (e.command === 'irsim') return { text: await openCanvas($, e.args) }
      if (e.command === 'irsim-stop') return { text: await stopCanvas($) }
      if (e.command === 'irsim-doctor') return { text: doctorLines(await runDoctor($)) }
      return { text: await commentCounts($) }
    } catch (error) {
      return { text: `irsim: ${messageOf(error)}` }
    }
  })

  on('tool.call', { tool: TOOL_MATCH }, async ($, e) => {
    try {
      return { result: await runTool($, e as unknown as Record<string, unknown>) }
    } catch (error) {
      return { deny: `design_canvas: ${messageOf(error)}` }
    }
  })

  on('tool.call', { tool: WRITE_TOOLS }, async ($, e, next) => {
    const result = await next(e)
    const path = (e as unknown as Record<string, unknown>).file_path
    if (isDesignFile(path)) {
      const session = await $.session.id()
      const written = designWrites.get(session) ?? new Set<string>()
      written.add(path)
      designWrites.set(session, written)
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) setTurnRunning(true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) setTurnRunning(false)
    void syncPoll($).catch(() => undefined)
    if (e.agentId === undefined && e.reason === 'answer') await reportLint($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stopPolling($)
    designWrites.delete(e.sessionId)
    lintReports.delete(e.sessionId)
    await $.store.delete(listenKey(e.sessionId)).catch(() => undefined)
    await api($, `/api/sessions/${encodeURIComponent(e.sessionId)}`, { method: 'DELETE' }).catch(
      () => undefined,
    )
    return next(e)
  })
}

async function reportLint($: Engine): Promise<void> {
  try {
    const session = await $.session.id()
    const written = designWrites.get(session)
    designWrites.delete(session)
    if (!written || written.size === 0) return
    const sent = lintReports.get(session) ?? 0
    if (sent >= LINT_REPORTS_PER_SESSION) return
    const report = await api<LintReport>($, '/api/lint')
    const errors = (report.problems ?? []).filter(
      (problem) =>
        problem.severity === 'error' &&
        [...written].some((path) => path === problem.file || path.endsWith(`/${problem.file}`)),
    )
    if (errors.length === 0) return
    lintReports.set(session, sent + 1)
    await $.prompt.submit({
      text: `irsim lint found format problems in the design folder. Fix these, then stop.\n${lintLines({ ...report, problems: errors })}`,
    })
  } catch {
    return
  }
}
