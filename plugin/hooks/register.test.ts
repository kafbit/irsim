import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const SESSION = 'abcdef123456'
const TOOL = 'mcp__irsim__design_canvas'

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
  options: { worktrees?: Worktrees; env?: string; submit?: 'drop' | 'reject'; hold?: Promise<void>; lint?: unknown } = {},
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
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('env.get', () => ({ value: options.env }))
  on('session.id', () => ({ value: SESSION }))
  on('session.cwd', () => ({ value: session.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__irsim__${e.name}` } }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', async (_, e) => {
    submitted.push(e.text)
    if (options.hold) await options.hold
    if (options.submit === 'reject') throw new Error('queue lost')
    if (options.submit === 'drop') return { drop: 'the turn was interrupted' }
    return { text: e.text }
  })
  on('process.run', (_, e) => {
    processes.push(e.argv)
    const here = worktrees[session.cwd]
    if (e.argv.includes('doctor')) {
      return {
        value: {
          exitCode: 1,
          stdout: JSON.stringify({
            ok: false,
            root: here?.root ?? '/work',
            summary: { ok: 2, warn: 1, fail: 1, skip: 0 },
            checks: [
              { id: 'config-file', group: 'config', title: '.irsim.json', status: 'ok', detail: 'designDir design' },
              { id: 'agents-block', group: 'rules', title: 'AGENTS.md', status: 'warn', detail: 'no managed block', fix: 'irsim init' },
              { id: 'git-repo', group: 'git', title: 'repository', status: 'ok', detail: '/work' },
              { id: 'board-files', group: 'config', title: 'board files', status: 'fail', detail: '1 board has no file: Gone', fix: 'irsim build' },
            ],
            context: { root: here?.root ?? '/work', designDir: '/work/design', boards: 2, repo: 'o/r', branch: 'main', commit: 'abc1234', detached: false, dirty: 0, port: 3238, running: true, irsim: '0.2.2' },
          }),
          stderr: '',
          isStdoutTruncated: false,
        },
      }
    }
    return {
      value: {
        exitCode: 0,
        stdout: e.argv.includes('rev-parse') ? (here?.root ?? '/work') : String(here?.port ?? ''),
        stderr: '',
        isStdoutTruncated: false,
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
        sections: [{ id: 'leads-variants', title: 'Leads variants', variantOf: 'Leads' }],
        boards: [
          {
            name: 'Leads',
            title: 'Leads',
            width: 1440,
            height: 900,
            closure: ['Table', 'Sidebar'],
            section: 'leads-variants',
          },
          {
            name: 'LeadsVariantSimpler',
            title: 'Leads: Simpler',
            width: 1440,
            height: 900,
            closure: [],
            section: 'leads-variants',
            variantOf: 'Leads',
            variantLabel: 'Simpler',
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
    if (url.pathname === '/api/lint' && options.lint !== undefined) return json(options.lint)
    if (url.pathname === '/api/comments/claim') return json(claim)
    if (url.pathname === '/api/comments') {
      return json([
        {
          id: 'c_1',
          status: 'queued',
          file: 'design/Leads.dc.html',
          line: 57,
          element: { tag: 'button', path: 'button', text: 'New lead' },
          body: 'Use the primary button.',
          replies: [],
        },
        {
          id: 'c_2',
          status: 'queued',
          file: 'design/Leads.dc.html',
          line: 0,
          element: { tag: 'div', path: 'div', text: 'Leads table' },
          body: 'Widen the first column.',
          replies: [{ author: 'claude', body: 'Done.' }],
        },
        {
          id: 'c_3',
          status: 'queued',
          file: 'design/Leads.dc.html',
          line: 12,
          element: { tag: 'button', path: 'button', text: 'OK' },
          body: 'Make it bigger.',
          view: { width: 390, height: 844 },
          replies: [],
        },
      ])
    }
    if (url.pathname === '/api/boards/Leads/check') {
      return json([
        { board: 'Leads', ok: true, ms: 820, errors: [], warnings: [], screenshot: '/w/Leads.png' },
      ])
    }
    if (url.pathname === '/api/pages/sales/check') {
      return json([
        { board: 'Leads', ok: true, ms: 800, errors: [], warnings: [], screenshot: '/w/Leads.png' },
        {
          board: 'Blank',
          ok: false,
          ms: 300,
          errors: ['render: boom'],
          warnings: ['the board renders no text and no image'],
        },
      ])
    }
    return json({ ok: true })
  })

  return { calls, processes, submitted, statuses, clock, session }
}

test('/irsim Leads resolves the board to its page and registers the session', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { text } = await run($, 'irsim', 'Leads')

  const url = `http://localhost:3238/p/sales?board=Leads&session=${SESSION}`
  expect(text).toBe(`Canvas open at ${url}, listening for comments.`)
  const session = w.calls.find((call) => call.method === 'POST' && call.path === '/api/sessions')
  expect(session?.body).toEqual({
    id: SESSION,
    label: 'design-app abcdef',
    cwd: '/work/design-app',
    agent: 'claude-code',
  })
  expect(w.processes.some((argv) => argv.includes(url))).toBe(true)
  expect(w.statuses).toContain('canvas http://localhost:3238 · listening')
})

test('the poll submits one prompt when claim returns comments and none when it returns zero', async ($, on) => {
  const text = 'Design canvas: 2 comments on page sales (batch b_1).'
  const w = world(on, { count: 2, text })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'irsim', '')

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

const claimCalls = (w: { calls: Call[] }) =>
  w.calls.filter((call) => call.path === '/api/comments/claim').length

test('the poll does not claim while a main-loop turn runs and claims again after it completes', async ($, on) => {
  const text = 'Design canvas: 1 comment on page sales (batch b_1).'
  const w = world(on, { count: 1, text })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'irsim', '')

  await $.turn.start({ text: 'go', turnId: 't1' })
  await w.clock.advance(6000)
  expect(claimCalls(w)).toBe(0)

  await $.turn.start({ text: 'sub', turnId: 't2', agentId: 'agent-1' })
  await $.turn.complete({ turnId: 't2', agentId: 'agent-1', reason: 'answer', answer: '', durationMs: 1 })
  await w.clock.advance(4000)
  expect(claimCalls(w)).toBe(0)

  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 1 })
  await w.clock.advance(2000)
  expect(claimCalls(w)).toBeGreaterThan(0)
  expect(w.submitted).toEqual([text])
})

for (const submit of ['drop', 'reject'] as const) {
  test(`a ${submit === 'drop' ? 'dropped' : 'rejected'} submit releases the claimed items`, async ($, on) => {
    const text = 'Design canvas: 1 comment on page sales (batch b_1).'
    const w = world(
      on,
      {
        count: 3,
        text,
        comments: [{ id: 'c_1', newReplies: [{ at: '2026-11-08T10:00:00.000Z' }] }],
        approvals: [{ id: 'a_1' }],
        variants: [{ id: 'v_1' }],
        pages: [{ id: 'p_1' }],
      } as { count: number; text?: string },
      { submit },
    )
    await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
    await run($, 'irsim', '')

    await w.clock.advance(2000)
    expect(w.submitted).toEqual([text])
    const released = w.calls.filter((call) => call.path === '/api/comments/release')
    expect(released).toEqual([
      {
        method: 'POST',
        path: '/api/comments/release',
        body: {
          sessionId: SESSION,
          comments: ['c_1'],
          approvals: ['a_1'],
          variants: ['v_1'],
          pages: ['p_1'],
          replies: [{ comment: 'c_1', at: '2026-11-08T10:00:00.000Z' }],
        },
        port: '3238',
      },
    ])
  })
}

test('the poll does not claim while a submit is pending and claims again once it resolves', async ($, on) => {
  let finish: () => void = () => undefined
  const hold = new Promise<void>((resolve) => {
    finish = resolve
  })
  const w = world(on, { count: 1, text: 'Design canvas: 1 comment.' }, { hold })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'irsim', '')

  await w.clock.advance(2000)
  expect(w.submitted).toHaveLength(1)
  const claims = claimCalls(w)
  expect(claims).toBeGreaterThan(0)

  await w.clock.advance(6000)
  expect(claimCalls(w)).toBe(claims)
  expect(w.submitted).toHaveLength(1)

  finish()
  await w.clock.advance(2000)
  expect(claimCalls(w)).toBeGreaterThan(claims)
})

test('a delivered submit does not release', async ($, on) => {
  const w = world(on, { count: 1, text: 'Design canvas: 1 comment.' })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'irsim', '')
  await w.clock.advance(2000)
  expect(w.submitted).toHaveLength(1)
  expect(w.calls.some((call) => call.path === '/api/comments/release')).toBe(false)
})

test('the poll stays silent when claim returns zero and after /irsim-stop', async ($, on) => {
  const w = world(on, { count: 0 })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })
  await run($, 'irsim', '')

  await w.clock.advance(4000)
  expect(w.submitted).toEqual([])
  expect(w.calls.filter((call) => call.path === '/api/comments/claim').length).toBeGreaterThan(0)

  const { text } = await run($, 'irsim-stop', '')
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
    { method: 'POST', path: '/api/comments/c_1/reply', body: { body: 'Done.', author: 'claude', session: SESSION } },
    { method: 'POST', path: '/api/comments/c_2/reply', body: { body: 'Fixed.', author: 'claude', session: SESSION } },
    { method: 'PATCH', path: '/api/comments/c_2', body: { status: 'resolved' } },
  ])
})

test('the comments action names an element by file:line and a whole board by the word board', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { result } = await $.tool.call({ tool: TOOL, action: 'comments' })

  expect(result).toBe(
    [
      'c_1 queued design/Leads.dc.html:57 button "New lead" Use the primary button.',
      'c_2 queued design/Leads.dc.html board "Leads table" Widen the first column. (1 reply)',
      'c_3 queued design/Leads.dc.html:12 viewport 390x844 button "OK" Make it bigger.',
    ].join('\n'),
  )
})

test('the page action returns the sections and one line per board', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { result } = await $.tool.call({ tool: TOOL, action: 'page', page: 'sales' })

  expect(result).toBe(
    [
      'sales: Sales',
      'section leads-variants: Leads variants (2 boards)',
      'Leads  1440x900  closure: Table, Sidebar  section: leads-variants',
      'LeadsVariantSimpler  1440x900  variant of Leads: Simpler  section: leads-variants',
    ].join('\n'),
  )
})

test('the port comes from `irsim port` run in the session folder', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  await run($, 'irsim', '')

  expect(w.processes).toContainEqual(['irsim', 'port'])
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
  const first = await run($, 'irsim', '')
  expect(first.text).toContain('http://localhost:3211/')

  w.calls.length = 0
  w.session.cwd = '/work/two'
  const second = await run($, 'irsim', '')
  expect(second.text).toContain('http://localhost:3277/')
  expect(w.calls.every((call) => call.port === '3277')).toBe(true)
})

test('IRSIM_PORT wins and `irsim port` is not run', async ($, on) => {
  const worktrees: Worktrees = { '/work/forced': { root: '/work/forced', port: 3299 } }
  const w = world(on, { count: 0 }, { worktrees, env: '4555' })
  await $.session.start({ cwd: '/work/forced', surface: 'terminal', isInteractive: true })
  w.session.cwd = '/work/forced'

  const { text } = await run($, 'irsim', '')

  expect(text).toContain('http://localhost:4555/')
  expect(w.processes.some((argv) => argv[0] === 'irsim' && argv[1] === 'port')).toBe(false)
})

test('the check action reports ok boards in one line and failures with their errors', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const one = await $.tool.call({ tool: TOOL, action: 'check', board: 'Leads' })
  expect(one.result).toBe('Leads ok 820 ms · screenshot: /w/Leads.png')

  const all = await $.tool.call({ tool: TOOL, action: 'check', page: 'sales' })
  expect(all.result).toBe(
    [
      'Leads ok 800 ms · screenshot: /w/Leads.png',
      'Blank FAIL 300 ms',
      '  error: render: boom',
      '  warning: the board renders no text and no image',
      '  no screenshot',
      '1 ok, 1 failed',
    ].join('\n'),
  )
  expect(w.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
    '/api/boards/Leads/check',
    '/api/pages/sales/check',
  ])

  const both = await $.tool.call({ tool: TOOL, action: 'check', board: 'Leads', page: 'sales' })
  expect(JSON.stringify(both)).toContain('check takes board or page, not both')
})

test('/irsim-doctor runs irsim doctor --json in the worktree and formats the report', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const { text } = await run($, 'irsim-doctor', '')

  expect(text).toBe(
    [
      'irsim doctor: /work',
      'config:',
      '  ok .irsim.json · designDir design',
      '  FAIL board files · 1 board has no file: Gone',
      '    fix: irsim build',
      'rules:',
      '  warn AGENTS.md · no managed block',
      '    fix: irsim init',
      'git:',
      '  ok repository · /work',
      '2 ok, 1 warning, 1 failed',
    ].join('\n'),
  )
  expect(w.processes).toContainEqual(['irsim', 'doctor', '--json'])
})

test('the doctor tool action returns the same lines as the command', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const viaTool = await $.tool.call({ tool: TOOL, action: 'doctor' })
  const viaCommand = await run($, 'irsim-doctor', '')

  expect(viaTool.result).toBe(viaCommand.text)
  expect(viaTool.result).toContain('2 ok, 1 warning, 1 failed')
})

const LINT = {
  ok: false,
  problems: [
    { severity: 'error', file: 'design/canvas.json', path: 'pages[0].boards[0]', rule: 'board-title', message: 'the board has no title', fix: 'irsim lint --fix' },
    { severity: 'warning', file: 'design/Leads.html', path: 'title', rule: 'title-empty', message: 'the title is empty' },
  ],
}

test('the lint tool action calls GET /api/lint and lists the problems', async ($, on) => {
  const w = world(on, { count: 0 }, { lint: LINT })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const lint = await $.tool.call({ tool: TOOL, action: 'lint' })

  expect(lint.result).toBe(
    [
      'error design/canvas.json pages[0].boards[0] board-title: the board has no title (fix: irsim lint --fix)',
      'warning design/Leads.html title title-empty: the title is empty',
      '1 error, 1 warning',
    ].join('\n'),
  )
  expect(w.calls.map((call) => call.path)).toContain('/api/lint')
})

test('the lint tool action says the folder passes when there are no problems', async ($, on) => {
  world(on, { count: 0 }, { lint: { ok: true, problems: [] } })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const lint = await $.tool.call({ tool: TOOL, action: 'lint' })

  expect(lint.result).toBe('The design folder passes the lint.')
})

test('check puts the lint problems before the check output, and ignores a canvas without /api/lint', async ($, on) => {
  world(on, { count: 0 }, { lint: LINT })
  await $.session.start({ cwd: '/work/design-app', surface: 'terminal', isInteractive: true })

  const checked = await $.tool.call({ tool: TOOL, action: 'check', board: 'Leads' })
  const lines = String(checked.result).split('\n')

  expect(lines[0]).toBe('Format problems:')
  expect(lines).toContain('1 error, 1 warning')
  expect(lines.at(-1)).toContain('Leads ok 820 ms')
})
