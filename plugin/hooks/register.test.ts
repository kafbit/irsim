import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const SESSION = 'abcdef123456'
const TOOL = 'mcp__design-canvas__design_canvas'

const run = ($: Engine, command: string, args: string) =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

type Call = { method: string; path: string; body: unknown; port: string }
type Worktrees = Record<string, { root: string; port: number }>

const DEFAULT_WORKTREES: Worktrees = { '/work/design-app': { root: '/work', port: 3238 } }

function world(
  on: On,
  claim: { count: number; text?: string } = { count: 0 },
  options: { worktrees?: Worktrees; env?: string } = {},
) {
  const worktrees = options.worktrees ?? DEFAULT_WORKTREES
  const session = { cwd: '/work/design-app' }
  const calls: Call[] = []
  const processes: (readonly string[])[] = []
  const submitted: string[] = []
  const statuses: (string | undefined)[] = []
  const clock = mock.clock(on)
  mock.store(on)

  const json = (data: unknown) => ({
    value: { status: 200, ok: true, headers: {}, text: JSON.stringify(data) },
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: options.env }))
  on('session.id', () => ({ value: SESSION }))
  on('session.cwd', () => ({ value: session.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__design-canvas__${e.name}` } }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('process.run', (_, e) => {
    processes.push(e.argv)
    const here = worktrees[session.cwd]
    const root = e.argv.includes('--root') ? e.argv[e.argv.indexOf('--root') + 1] : undefined
    const port = Object.values(worktrees).find((one) => one.root === root)?.port
    return {
      value: {
        exitCode: 0,
        stdout: e.argv.includes('rev-parse') ? (here?.root ?? '/work') : String(port ?? ''),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('http.fetch', (_, e) => {
    const url = new URL(e.url)
    const method = e.init?.method ?? 'GET'
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    calls.push({ method, path: url.pathname, body, port: url.port })
    if (url.pathname === '/api/health') return json({ ok: true, version: 1, root: '/work' })
    if (url.pathname === '/api/pages') {
      return json([
        { id: 'sales', title: 'Sales', boardCount: 1, boards: ['Leads'] },
        { id: 'inventory', title: 'Inventory', boardCount: 1, boards: ['Properties'] },
      ])
    }
    if (url.pathname === '/api/pages/sales') {
      return json({
        id: 'sales',
        title: 'Sales',
        boards: [
          {
            name: 'Leads',
            title: 'Leads',
            width: 1440,
            height: 900,
            closure: ['Table', 'Sidebar'],
          },
        ],
      })
    }
    if (url.pathname === '/api/pages/inventory') {
      return json({
        id: 'inventory',
        title: 'Inventory',
        boards: [
          { name: 'Properties', title: 'Properties', width: 1440, height: 1200, closure: [] },
        ],
      })
    }
    if (url.pathname === '/api/comments/claim') return json(claim)
    return json({ ok: true })
  })

  return { calls, processes, submitted, statuses, clock, session }
}

test('/canvas Leads resolves the board to its page and registers the session', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { text } = await run($, 'canvas', 'Leads')

  const url = `http://localhost:3238/p/sales?board=Leads&session=${SESSION}`
  expect(text).toBe(`Canvas open at ${url}, listening for comments.`)
  const session = w.calls.find((call) => call.method === 'POST' && call.path === '/api/sessions')
  expect(session?.body).toEqual({
    id: SESSION,
    label: 'design-app abcdef',
    cwd: '/work/design-app',
  })
  expect(w.processes.some((argv) => argv.includes(url))).toBe(true)
  expect(w.statuses).toContain('canvas · listening')
})

test('the poll submits one prompt when claim returns comments and none when it returns zero', async ($, on) => {
  const text = 'Design canvas: 2 comments on page sales (batch b_1).'
  const w = world(on, { count: 2, text })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'canvas', '')

  await w.clock.advance(2000)
  expect(w.submitted).toEqual([text])
  const claim = w.calls.find((call) => call.path === '/api/comments/claim')
  expect(claim).toEqual({
    method: 'POST',
    path: '/api/comments/claim',
    body: { sessionId: SESSION },
    port: '3238',
  })
})

test('the poll stays silent when claim returns zero and after /canvas-stop', async ($, on) => {
  const w = world(on, { count: 0 })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'canvas', '')

  await w.clock.advance(4000)
  expect(w.submitted).toEqual([])
  expect(w.calls.filter((call) => call.path === '/api/comments/claim').length).toBeGreaterThan(0)

  const { text } = await run($, 'canvas-stop', '')
  expect(text).toBe('Canvas listening stopped for this session.')
  expect(
    w.calls.some((call) => call.method === 'DELETE' && call.path === `/api/sessions/${SESSION}`),
  ).toBe(true)
  const claims = w.calls.filter((call) => call.path === '/api/comments/claim').length
  await w.clock.advance(6000)
  expect(w.calls.filter((call) => call.path === '/api/comments/claim').length).toBe(claims)
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('the reply and resolve tool calls hit the right routes', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const reply = await $.tool.call({ tool: TOOL, action: 'reply', id: 'c_1', body: 'Done.' })
  expect(reply.result).toBe('Replied to c_1.')

  const resolved = await $.tool.call({ tool: TOOL, action: 'resolve', id: 'c_2', body: 'Fixed.' })
  expect(resolved.result).toBe('Resolved c_2.')

  const writes = w.calls
    .filter((call) => call.method !== 'GET')
    .map(({ method, path, body }) => ({ method, path, body }))
  expect(writes).toEqual([
    { method: 'POST', path: '/api/comments/c_1/reply', body: { body: 'Done.', author: 'claude' } },
    { method: 'POST', path: '/api/comments/c_2/reply', body: { body: 'Fixed.', author: 'claude' } },
    { method: 'PATCH', path: '/api/comments/c_2', body: { status: 'resolved' } },
  ])
})

test('the page action returns one line per board', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { result } = await $.tool.call({ tool: TOOL, action: 'page', page: 'sales' })

  expect(result).toBe('sales: Sales\nLeads  1440x900  closure: Table, Sidebar')
})

test('the port comes from the canvas-port script run in the session worktree', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  await run($, 'canvas', '')

  expect(w.processes).toContainEqual([
    'bun',
    'apps/design/scripts/canvas-port.ts',
    '--root',
    '/work',
  ])
  expect(w.calls.every((call) => call.port === '3238')).toBe(true)
})

test('two worktrees talk to their own canvas port', async ($, on) => {
  const worktrees: Worktrees = {
    '/work/one/apps/web': { root: '/work/one', port: 3211 },
    '/work/two': { root: '/work/two', port: 3277 },
  }
  const w = world(on, { count: 0 }, { worktrees })
  await $.session.start({ cwd: '/work/one/apps/web', surface: 'terminal', isInteractive: true })
  w.session.cwd = '/work/one/apps/web'
  const first = await run($, 'canvas', '')
  expect(first.text).toContain('http://localhost:3211/')

  w.calls.length = 0
  w.session.cwd = '/work/two'
  const second = await run($, 'canvas', '')
  expect(second.text).toContain('http://localhost:3277/')
  expect(w.calls.every((call) => call.port === '3277')).toBe(true)
})

test('DESIGN_PORT wins and the canvas-port script is not run', async ($, on) => {
  const worktrees: Worktrees = { '/work/forced': { root: '/work/forced', port: 3299 } }
  const w = world(on, { count: 0 }, { worktrees, env: '4555' })
  await $.session.start({ cwd: '/work/forced', surface: 'terminal', isInteractive: true })
  w.session.cwd = '/work/forced'

  const { text } = await run($, 'canvas', '')

  expect(text).toContain('http://localhost:4555/')
  expect(w.processes.some((argv) => argv.includes('apps/design/scripts/canvas-port.ts'))).toBe(
    false,
  )
})
