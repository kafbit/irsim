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

export async function baseUrl($: Engine): Promise<string> {
  const port = await $.env.get('DESIGN_PORT')
  return `http://localhost:${port || 3200}`
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
    throw new CanvasError('the canvas server is not running, run /canvas')
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
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  const root = top.stdout.trim()
  if (top.exitCode !== 0 || !root)
    throw new CanvasError('the session is not inside the Kafbit repository')
  await $.process.run(
    [
      'sh',
      '-c',
      'mkdir -p apps/design/.data && nohup bun run canvas > apps/design/.data/canvas.log 2>&1 < /dev/null &',
    ],
    { cwd: root },
  )
  for (let waited = 0; waited < START_TIMEOUT_MS; waited += START_STEP_MS) {
    await $.clock.sleep(START_STEP_MS)
    if (await isUp($)) return
  }
  throw new CanvasError(
    `the canvas server did not answer within 30 s, see ${root}/apps/design/.data/canvas.log`,
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
