import { projectRoot } from '../src/lib/design-dir'
import { canvasPort } from '../src/lib/port'

const base = `http://localhost:${await canvasPort(projectRoot())}`
const POLL_MS = 2000

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const call = async (path: string, init?: { method: string; body: unknown }): Promise<unknown> => {
  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`)
  return data
}

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const guarded = async (run: () => Promise<unknown>): Promise<void> => {
  try {
    console.log(JSON.stringify(await run(), null, 2))
  } catch (error) {
    const down = error instanceof TypeError
    fail(
      down
        ? `canvas server is not reachable at ${base}`
        : String(error instanceof Error ? error.message : error),
    )
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const wait = async (): Promise<void> => {
  const session = { id: 'cli', label: 'CLI', cwd: process.cwd() }
  let warned = false
  for (;;) {
    try {
      await call('/api/sessions', { method: 'POST', body: session })
      const claim = (await call('/api/comments/claim', {
        method: 'POST',
        body: { sessionId: session.id },
      })) as { count: number }
      if (claim.count > 0) {
        console.log(JSON.stringify(claim, null, 2))
        return
      }
    } catch (error) {
      if (!(error instanceof TypeError))
        fail(String(error instanceof Error ? error.message : error))
      if (!warned) console.error(`canvas server is not reachable at ${base}, retrying`)
      warned = true
    }
    await sleep(POLL_MS)
  }
}

const usage =
  'usage: irsim comments --wait | --list [--status s] | --reply <id> <body> | --resolve <id>'

if (args.includes('--wait')) await wait()
else if (args.includes('--list')) {
  const status = flag('--status')
  await guarded(() => call(`/api/comments${status ? `?status=${encodeURIComponent(status)}` : ''}`))
} else if (args.includes('--reply')) {
  const at = args.indexOf('--reply')
  const [id, body] = [args[at + 1], args[at + 2]]
  if (!id || !body) fail(usage)
  await guarded(() =>
    call(`/api/comments/${id}/reply`, { method: 'POST', body: { body, author: 'claude' } }),
  )
} else if (args.includes('--resolve')) {
  const id = flag('--resolve')
  if (!id) fail(usage)
  await guarded(() =>
    call(`/api/comments/${id}`, { method: 'PATCH', body: { status: 'resolved' } }),
  )
} else fail(usage)
