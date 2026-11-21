import type { EngineInterface } from 'claude-code'

export type Engine = EngineInterface

export type PageSummary = { id: string; title: string; boardCount: number }
type PageBoard = {
  name: string
  title?: string
  width: number
  height: number
  closure?: string[]
  openComments?: number
  section?: string
  variantOf?: string
  variantLabel?: string
}
export type PageSection = { id: string; title: string; variantOf?: string }
export type Page = { id: string; title: string; sections?: PageSection[]; boards: PageBoard[] }
export type Comment = {
  id: string
  page: string
  board: string
  file: string
  line: number
  element: { path: string; text: string }
  body: string
  view?: { width: number; height: number }
  status: 'draft' | 'queued' | 'delivered' | 'resolved'
  replies: { author: string; body: string }[]
}
export type CheckResult = {
  board: string
  ok: boolean
  ms: number
  errors: string[]
  warnings: string[]
  screenshot?: string
}
export type LintProblem = {
  severity: 'error' | 'warning'
  file: string
  path: string
  rule: string
  message: string
  fix?: string
}
export type LintReport = { ok: boolean; problems: LintProblem[] }
type ClaimedReply = { at: string }
export type Claim = {
  count: number
  text?: string
  comments?: { id: string; newReplies?: ClaimedReply[] }[]
  approvals?: { id: string }[]
  variants?: { id: string }[]
  pages?: { id: string }[]
}
export type Release = {
  sessionId: string
  comments: string[]
  approvals: string[]
  variants: string[]
  pages: string[]
  replies: { comment: string; at: string }[]
}

const START_TIMEOUT_MS = 30_000
const START_STEP_MS = 500

export class CanvasError extends Error {}

export const listenKey = (sessionId: string): string => `listening:${sessionId}`
export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const worktrees = new Map<string, { root: string; port: number }>()

async function forcedPort($: Engine): Promise<number> {
  for (const raw of [await $.env.get('IRSIM_PORT'), await $.env.get('DESIGN_PORT')]) {
    const value = Number(raw)
    if (Number.isInteger(value) && value >= 1) return value
  }
  return 0
}

async function worktreeOf($: Engine): Promise<{ root: string; port: number }> {
  const cwd = await $.session.cwd()
  const known = worktrees.get(cwd)
  if (known) return known
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  const root = top.exitCode === 0 && top.stdout.trim() ? top.stdout.trim() : cwd
  let port = await forcedPort($)
  if (port === 0) {
    const resolved = await $.process.run(['irsim', 'port'], { cwd })
    port = Number(resolved.stdout.trim())
    if (resolved.exitCode !== 0 || !Number.isInteger(port))
      throw new CanvasError(`no irsim port for ${root}: ${oneLine(resolved.stderr)}`)
  }
  const found = { root, port }
  worktrees.set(cwd, found)
  return found
}

export async function baseUrl($: Engine): Promise<string> {
  return `http://localhost:${(await worktreeOf($)).port}`
}

export async function api<T>(
  $: Engine,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${await baseUrl($)}${path}`
  let response
  try {
    response = await $.http.fetch(url, {
      method: init.method ?? 'GET',
      ...(init.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
    })
  } catch {
    throw new CanvasError('the irsim server is not running, run /irsim')
  }
  let data: unknown = null
  try {
    data = JSON.parse(response.text)
  } catch {
    data = null
  }
  if (!response.ok) {
    const reason = (data as { error?: unknown } | null)?.error
    throw new CanvasError(
      typeof reason === 'string'
        ? reason
        : `${init.method ?? 'GET'} ${path} answered ${response.status}`,
    )
  }
  return data as T
}

async function isUp($: Engine): Promise<boolean> {
  try {
    await api($, '/api/health')
    return true
  } catch {
    return false
  }
}

export async function ensureServer($: Engine): Promise<void> {
  if (await isUp($)) return
  worktrees.delete(await $.session.cwd())
  if (await isUp($)) return
  const { root } = await worktreeOf($)
  await $.process.run(
    [
      'sh',
      '-c',
      'mkdir -p "$1/.irsim" && nohup irsim serve > "$1/.irsim/canvas.log" 2>&1 < /dev/null &',
      'sh',
      root,
    ],
    { cwd: await $.session.cwd() },
  )
  for (let waited = 0; waited < START_TIMEOUT_MS; waited += START_STEP_MS) {
    await $.clock.sleep(START_STEP_MS)
    if (await isUp($)) return
  }
  throw new CanvasError(
    `the irsim server did not answer within 30 s, see ${root}/.irsim/canvas.log`,
  )
}

export async function registerSession($: Engine, cwd: string, sessionId: string): Promise<void> {
  const parts = cwd.split('/').filter(Boolean)
  const label = `${parts[parts.length - 1] ?? cwd} ${sessionId.slice(0, 6)}`
  await api($, '/api/sessions', {
    method: 'POST',
    body: { id: sessionId, label, cwd, agent: 'claude-code' },
  })
}

export type DoctorCheck = {
  id: string
  group: 'config' | 'rules' | 'git' | 'runtime'
  title: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  detail: string
  fix?: string
}

export type DoctorReport = {
  ok: boolean
  root: string
  summary: { ok: number; warn: number; fail: number; skip: number }
  checks: DoctorCheck[]
  context: {
    root: string
    designDir: string | null
    boards: number
    repo: string | null
    branch: string | null
    commit: string | null
    detached: boolean
    dirty: number
    port: number | null
    running: boolean
    irsim: string
  }
}

const MARKS: Record<DoctorCheck['status'], string> = { ok: 'ok', warn: 'warn', fail: 'FAIL', skip: 'skip' }
const GROUPS: DoctorCheck['group'][] = ['config', 'rules', 'git', 'runtime']

/** One line per check with its fix, then the summary, for the agent to read. */
export function doctorLines(report: DoctorReport): string {
  const lines = [`irsim doctor: ${report.root}`]
  for (const group of GROUPS) {
    const members = report.checks.filter((one) => one.group === group)
    if (members.length === 0) continue
    lines.push(`${group}:`)
    for (const one of members) {
      lines.push(`  ${MARKS[one.status]} ${one.title} · ${one.detail}`)
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

/** One line per problem, then the count, or the pass line. */
export function lintLines(report: LintReport): string {
  const problems = report.problems ?? []
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

export async function runDoctor($: Engine): Promise<DoctorReport> {
  const root = await worktreeOf($)
  const result = await $.process.run(['irsim', 'doctor', '--json'], { cwd: root.root })
  if (result.exitCode !== 0 && !result.stdout.trim())
    throw new CanvasError(`irsim doctor failed: ${oneLine(result.stderr)}`)
  try {
    return JSON.parse(result.stdout) as DoctorReport
  } catch {
    throw new CanvasError(`irsim doctor printed no JSON: ${oneLine(result.stderr || result.stdout)}`)
  }
}

export async function openUrl($: Engine, url: string): Promise<void> {
  await $.process.run([
    'sh',
    '-c',
    'case "$(uname -s)" in Darwin) o=open;; *) o=xdg-open;; esac; nohup "$o" "$1" > /dev/null 2>&1 < /dev/null &',
    'sh',
    url,
  ])
}
