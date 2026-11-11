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
}
export type Page = { id: string; title: string; boards: PageBoard[] }
export type Comment = {
  id: string
  page: string
  board: string
  file: string
  line: number
  element: { text: string }
  body: string
  status: 'draft' | 'queued' | 'delivered' | 'resolved'
  replies: { author: string; body: string }[]
}
export type Claim = { count: number; text?: string }

const START_TIMEOUT_MS = 30_000
const START_STEP_MS = 500

export class CanvasError extends Error {}

export const listenKey = (sessionId: string): string => `listening:${sessionId}`
export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const worktrees = new Map<string, { root: string; port: number }>()

async function forcedPort($: Engine): Promise<number> {
  for (const name of ['IRSIM_PORT', 'DESIGN_PORT']) {
    const value = Number(await $.env.get(name))
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
  await api($, '/api/sessions', { method: 'POST', body: { id: sessionId, label, cwd } })
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
