import { execFile, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agentName, agentOf } from '../src/lib/agents'

const CLI = fileURLToPath(new URL('../../bin/irsim', import.meta.url))
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')

type Received = { method: string; path: string; body: unknown }

describe('bridge', () => {
  let server: Server
  let port = 0
  const received: Received[] = []
  const claimText = 'Design canvas: 1 comment on page canvas-app (batch b1).'
  let claimed = true
  let lintReport: unknown = { ok: true, problems: [] }
  const lintProblems = [
    { severity: 'error', file: 'design/canvas.json', path: 'pages[0].boards[0]', rule: 'board-title', message: 'the board has no title', fix: 'irsim lint --fix' },
    { severity: 'warning', file: 'design/Leads.html', path: 'title', rule: 'title-empty', message: 'the title is empty', fix: '' },
  ]

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        const body = raw ? JSON.parse(raw) : null
        received.push({ method: request.method ?? '', path: request.url ?? '', body })
        const json = (value: unknown) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify(value))
        }
        if (request.url === '/api/health') return json({ ok: true, root: ROOT })
        if (request.url === '/api/sessions' && request.method === 'POST') {
          return json({ id: (body as { id: string }).id })
        }
        if (request.url === '/api/comments/claim' && request.method === 'POST') {
          return json(
            claimed
              ? { count: 1, text: claimText, comments: [], approvals: [] }
              : { count: 0, comments: [], approvals: [] },
          )
        }
        if (request.url === '/api/lint') return json(lintReport)
        if (request.url === '/api/boards/Leads/check' && request.method === 'POST') {
          return json([{ board: 'Leads', ok: true, ms: 5, errors: [], warnings: [] }])
        }
        if (request.url === '/api/comments/release' && request.method === 'POST') {
          return json({ ok: true })
        }
        if (request.url?.startsWith('/api/comments/c_1')) return json({ ok: true })
        if (request.url?.startsWith('/api/sessions/') && request.method === 'DELETE') {
          return json({ ok: true })
        }
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'not found' }))
      })
    })
    await new Promise<void>((done) => server.listen(0, done))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()))
  })

  beforeEach(() => {
    received.length = 0
    claimed = true
    lintReport = { ok: true, problems: [] }
  })

  const env = () => ({ ...process.env, IRSIM_PORT: String(port) })

  const bridge = (args: string[], input?: string, extraEnv = {}): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [CLI, 'bridge', ...args],
        { encoding: 'utf8', env: { ...env(), ...extraEnv }, cwd: ROOT },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      )
      child.stdin?.end(input ?? '')
    })

  it('registers a session with its agent', async () => {
    await bridge(['register', '--agent', 'codex', '--session', 'abc123def', '--cwd', ROOT])
    const post = received.find((one) => one.path === '/api/sessions')
    expect(post?.body).toMatchObject({ id: 'abc123def', agent: 'codex', cwd: ROOT })
    expect((post?.body as { label: string }).label).toBe('Codex · irsim abc123')
  })

  it('posts the body as a reply before resolving', async () => {
    await bridge(['tool', 'resolve', '--id', 'c_1', '--body', 'Fixed the padding', '--session', 'abc123def'])
    const calls = received.filter(({ path }) => path.startsWith('/api/comments/'))
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/comments/c_1/reply',
      'PATCH /api/comments/c_1',
    ])
    expect(calls[0]?.body).toMatchObject({ author: 'claude', body: 'Fixed the padding' })
  })

  it('prints the claim text for a listening session', async () => {
    const text = (await bridge(['claim', '--session', 'abc123def', '--cwd', ROOT])).trim()
    expect(text).toBe(claimText)
    expect(received.at(-1)?.body).toEqual({ sessionId: 'abc123def' })
  })

  it('releases the ids of a claim that was not delivered', async () => {
    const claimed = {
      count: 3,
      text: claimText,
      comments: [{ id: 'c_1', newReplies: [{ at: '2026-11-08T10:00:00.000Z' }] }, { id: 'c_2' }],
      approvals: [{ id: 'a_1' }],
      variants: [{ id: 'v_1' }],
      pages: [{ id: 'p_1' }],
    }
    await bridge(['release', '--session', 'abc123def', '--cwd', ROOT, '--claim', JSON.stringify(claimed)])
    const release = received.find((one) => one.path === '/api/comments/release')
    expect(release?.method).toBe('POST')
    expect(release?.body).toEqual({
      sessionId: 'abc123def',
      comments: ['c_1', 'c_2'],
      approvals: ['a_1'],
      variants: ['v_1'],
      pages: ['p_1'],
      replies: [{ comment: 'c_1', at: '2026-11-08T10:00:00.000Z' }],
    })
  })

  it('forces Codex to continue when the canvas has comments', async () => {
    const out = await bridge(
      ['hook', 'codex', 'Stop'],
      JSON.stringify({ session_id: 'abc123def', cwd: ROOT, stop_hook_active: false }),
    )
    expect(JSON.parse(out)).toEqual({ decision: 'block', reason: claimText })
  })

  it('respects an active Codex stop hook', async () => {
    const out = await bridge(
      ['hook', 'codex', 'Stop'],
      JSON.stringify({ session_id: 'abc123def', cwd: ROOT, stop_hook_active: true }),
    )
    expect(JSON.parse(out)).toEqual({})
  })

  it('adds comments to a Codex user prompt as context', async () => {
    const out = await bridge(
      ['hook', 'codex', 'UserPromptSubmit'],
      JSON.stringify({ session_id: 'abc123def', cwd: ROOT, prompt: 'go on' }),
    )
    expect(JSON.parse(out)).toEqual({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: claimText },
    })
  })

  it('does nothing when the canvas is not running', async () => {
    const out = await bridge(
      ['hook', 'codex', 'Stop'],
      JSON.stringify({ session_id: 'abc', cwd: ROOT }),
      { IRSIM_PORT: '1' },
    )
    expect(JSON.parse(out)).toEqual({})
  })

  it('lists the lint problems as one line each with a count', async () => {
    lintReport = { ok: false, problems: lintProblems }
    const out = (await bridge(['tool', 'lint', '--cwd', ROOT])).trim().split('\n')
    expect(out).toEqual([
      'error design/canvas.json pages[0].boards[0] board-title: the board has no title (fix: irsim lint --fix)',
      'warning design/Leads.html title title-empty: the title is empty',
      '1 error, 1 warning',
    ])
  })

  it('says the design folder passes the lint when there are no problems', async () => {
    expect((await bridge(['tool', 'lint', '--cwd', ROOT])).trim()).toBe('The design folder passes the lint.')
  })

  it('puts the lint problems before the check output', async () => {
    lintReport = { ok: false, problems: lintProblems }
    const out = (await bridge(['tool', 'check', '--board', 'Leads', '--cwd', ROOT])).trim()
    expect(out).toBe(
      [
        'Format problems:',
        'error design/canvas.json pages[0].boards[0] board-title: the board has no title (fix: irsim lint --fix)',
        'warning design/Leads.html title title-empty: the title is empty',
        'Leads ok 5 ms · no screenshot',
      ].join('\n'),
    )
    expect(received.map(({ path }) => path)).toContain('/api/lint')
  })

  it('counts the warnings of boards that were not checked', async () => {
    lintReport = {
      ok: true,
      problems: [{ severity: 'warning', file: 'design/Other.html', path: '', rule: 'board-preview', message: 'no preview', fix: '' }],
    }
    const out = (await bridge(['tool', 'check', '--board', 'Leads', '--cwd', ROOT])).trim()
    expect(out).toBe(
      ['Format problems:', '1 other warning, run design_canvas lint to list them', 'Leads ok 5 ms · no screenshot'].join('\n'),
    )
  })

  it('adds the irsim skills to a Codex session start', async () => {
    const out = JSON.parse(
      await bridge(['hook', 'codex', 'SessionStart'], JSON.stringify({ session_id: 'abc123def', cwd: ROOT })),
    )
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(out.hookSpecificOutput.additionalContext).toContain('`irsim-design` skill')
    expect(out.hookSpecificOutput.additionalContext).toContain('`irsim-workflow` skill')
    expect(out.hookSpecificOutput.additionalContext).toContain('irsim lint')
  })

  describe('Codex stop with lint errors', () => {
    const session = `lint-stop-${process.pid}`
    let project = ''
    const canvas = () => join(project, 'design', 'canvas.json')
    const touch = (seconds: number) => utimesSync(canvas(), seconds, seconds)
    beforeEach(() => {
      project = mkdtempSync(join(tmpdir(), 'irsim-stop-'))
      mkdirSync(join(project, 'design'))
      writeFileSync(join(project, '.irsim.json'), '{}')
      writeFileSync(canvas(), '{}')
      touch(1_000)
    })
    afterEach(() => rmSync(project, { recursive: true, force: true }))
    const start = () =>
      bridge(['hook', 'codex', 'SessionStart'], JSON.stringify({ session_id: session, cwd: project }))
    const stop = async (extra = {}) =>
      JSON.parse(await bridge(['hook', 'codex', 'Stop'], JSON.stringify({ session_id: session, cwd: project, ...extra })))

    it('blocks the stop with the problems, at most twice per session', async () => {
      claimed = false
      lintReport = { ok: false, problems: lintProblems }
      await start()
      touch(2_000)
      const first = await stop()
      expect(first.decision).toBe('block')
      expect(first.reason).toContain('error design/canvas.json')
      expect(first.reason.endsWith('Fix these, then stop.')).toBe(true)
      expect((await stop()).decision).toBe('block')
      expect(await stop()).toEqual({})
    })

    it('records the start mark and returns the context when the canvas is down', async () => {
      claimed = false
      lintReport = { ok: false, problems: lintProblems }
      const out = JSON.parse(
        await bridge(['hook', 'codex', 'SessionStart'], JSON.stringify({ session_id: session, cwd: project }), { IRSIM_PORT: '1' }),
      )
      expect(out.hookSpecificOutput.additionalContext).toContain('`irsim-design` skill')
      expect(received.some(({ path }) => path === '/api/sessions')).toBe(false)
      touch(2_000)
      expect((await stop()).decision).toBe('block')
    })

    it('returns nothing on a session start in a folder without an irsim project', async () => {
      const bare = mkdtempSync(join(tmpdir(), 'irsim-bare-'))
      try {
        const out = await bridge(['hook', 'codex', 'SessionStart'], JSON.stringify({ session_id: session, cwd: bare }), { IRSIM_PORT: '1' })
        expect(JSON.parse(out)).toEqual({})
      } finally {
        rmSync(bare, { recursive: true, force: true })
      }
    })

    it('does not block when the design folder is unchanged since the session start', async () => {
      claimed = false
      lintReport = { ok: false, problems: lintProblems }
      await start()
      expect(await stop()).toEqual({})
    })

    it('does not block a session that has no start record', async () => {
      claimed = false
      lintReport = { ok: false, problems: lintProblems }
      touch(2_000)
      expect(await stop()).toEqual({})
    })

    it('keeps the comments first and ignores a lint with only warnings', async () => {
      lintReport = { ok: false, problems: lintProblems }
      await start()
      touch(2_000)
      expect(await stop()).toEqual({ decision: 'block', reason: claimText })
      claimed = false
      lintReport = { ok: true, problems: [lintProblems[1]] }
      expect(await stop()).toEqual({})
      lintReport = { ok: false, problems: lintProblems }
      expect(await stop({ stop_hook_active: true })).toEqual({})
    })
  })

  it('does not pause a Codex session on stop, so its next hook registers it again', async () => {
    const project = mkdtempSync(join(tmpdir(), 'irsim-codex-stop-'))
    try {
      mkdirSync(join(project, 'design'))
      writeFileSync(join(project, '.irsim.json'), '{}')
      writeFileSync(join(project, 'design', 'canvas.json'), '{}')
      const session = `codex-stop-${process.pid}`
      expect((await bridge(['tool', 'stop', '--session', session, '--cwd', project])).trim()).toBe(
        'Stopped listening for irsim comments.',
      )
      expect(received.some((one) => one.method === 'DELETE' && one.path === `/api/sessions/${session}`)).toBe(true)
      const out = JSON.parse(
        await bridge(['hook', 'codex', 'PreModelRequest'], JSON.stringify({ session_id: session, cwd: project })),
      )
      expect(out.hookSpecificOutput.additionalContext).toBe(claimText)
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  const mcp = (
    agent: string,
    input: unknown[],
    extraEnv = {},
    cwd = ROOT,
  ): Promise<Array<{ result: any }>> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, 'bridge', 'mcp', '--agent', agent], {
        cwd,
        env: { ...env(), ...extraEnv },
      })
      let out = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => (out += chunk))
      child.on('error', reject)
      child.on('close', () => resolve(out.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))))
      child.stdin.end(`${input.map((one) => JSON.stringify(one)).join('\n')}\n`)
    })

  // An Antigravity MCP server in a temp project with its own cache and agy pid, so a test never
  // reads or deletes the session file of a real agy that runs the tests.
  const isolatedAgy = () => {
    const dir = mkdtempSync(join(tmpdir(), 'irsim-agy-mcp-'))
    return {
      dir,
      env: { IRSIM_CACHE_DIR: join(dir, 'cache'), IRSIM_ANTIGRAVITY_PID: `test-${process.pid}` },
      done: () => rmSync(dir, { recursive: true, force: true }),
    }
  }

  it('refuses an action the agent does not list', async () => {
    const [out] = await mcp('codex', [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'design_canvas', arguments: { action: 'stop' } } },
    ])
    expect((out.result as { isError?: boolean }).isError).toBe(true)
    expect(received.some(({ method }) => method === 'DELETE')).toBe(false)
  })

  it('takes the Antigravity session off the canvas when agy stops the MCP server with a signal', async () => {
    const agy = isolatedAgy()
    const child = spawn(process.execPath, [CLI, 'bridge', 'mcp', '--agent', 'antigravity'], {
      cwd: agy.dir,
      env: { ...env(), ...agy.env, ANTIGRAVITY_CONVERSATION_ID: 'agy-signal-1' },
    })
    try {
      const closed = new Promise<number | null>((done, fail) => {
        child.on('error', fail)
        child.on('close', (code) => done(code))
      })
      // Wait for the first answer, so the server is up, then stop it while stdin is still open.
      await new Promise<void>((ready, fail) => {
        child.on('error', fail)
        child.on('close', () => fail(new Error('the MCP server exited before it answered')))
        child.stdout.once('data', () => ready())
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`)
      })
      child.kill('SIGTERM')
      expect(await closed).toBe(143)
      expect(received.some((one) => one.method === 'DELETE' && one.path === '/api/sessions/agy-signal-1')).toBe(true)
    } finally {
      child.kill('SIGKILL')
      agy.done()
    }
  })

  it('lists stop only for Antigravity', async () => {
    const list = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]
    const actions = async (agent: string) =>
      (await mcp(agent, list))[0].result.tools[0].inputSchema.properties.action.enum as string[]
    expect(await actions('codex')).not.toContain('stop')
    expect(await actions('antigravity')).toContain('stop')
  })

  it('takes the Antigravity session off the canvas when agy closes the MCP server', async () => {
    const agy = isolatedAgy()
    try {
      await mcp('antigravity', [], { ...agy.env, ANTIGRAVITY_CONVERSATION_ID: 'agy-exit-1' }, agy.dir)
    } finally {
      agy.done()
    }
    expect(received.some((one) => one.method === 'DELETE' && one.path === '/api/sessions/agy-exit-1')).toBe(true)
  })

  it('serves design_canvas over MCP', () => {
    const out = spawnSync(process.execPath, [CLI, 'bridge', 'mcp'], {
      encoding: 'utf8',
      cwd: ROOT,
      env: env(),
      input: [
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        '',
      ].join('\n'),
    })
    const lines = out.stdout.trim().split('\n').map((line) => JSON.parse(line))
    expect(lines[0].result.serverInfo.name).toBe('irsim')
    expect(lines[1].result.tools[0].name).toBe('design_canvas')
    expect(lines[1].result.tools[0].inputSchema.properties.action.enum).toContain('check')
    expect(lines[1].result.tools[0].inputSchema.properties.action.enum).toContain('lint')
    expect(lines[1].result.tools[0].inputSchema.properties.action.enum).not.toContain('stop')
  })

  describe('Antigravity hooks', () => {
    const session = `agy-${process.pid}`
    let project = ''
    const canvas = () => join(project, 'design', 'canvas.json')
    const touch = (seconds: number) => utimesSync(canvas(), seconds, seconds)
    beforeEach(() => {
      project = mkdtempSync(join(tmpdir(), 'irsim-agy-'))
      mkdirSync(join(project, 'design'))
      writeFileSync(join(project, '.irsim.json'), '{}')
      writeFileSync(canvas(), '{}')
      touch(1_000)
    })
    afterEach(() => rmSync(project, { recursive: true, force: true }))
    const hook = async (event: string, extra: Record<string, unknown> = {}, extraEnv = {}) =>
      JSON.parse(
        await bridge(
          ['hook', 'antigravity', event],
          JSON.stringify({ conversationId: session, cwd: project, ...extra }),
          extraEnv,
        ),
      )

    it('registers Antigravity on SessionStart and injects the skills context', async () => {
      const out = await hook('SessionStart')
      expect(out.injectSteps[0].systemMessage.systemMessage).toContain('`irsim-design` skill')
      expect(out.injectSteps[0].systemMessage.systemMessage).toContain('`irsim-workflow` skill')
      const post = received.find((one) => one.path === '/api/sessions')
      expect((post?.body as { label?: string } | undefined)?.label).toBe(`Antigravity · ${project.split('/').at(-1)} ${session.slice(0, 6)}`)
    })

    it('delivers comments on PreInvocation and pauses after stop', async () => {
      await hook('SessionStart')
      const before = await hook('PreInvocation')
      expect(before).toEqual({ injectSteps: [{ systemMessage: { systemMessage: claimText } }] })
      const stopped = (await bridge(['tool', 'stop', '--agent', 'antigravity', '--cwd', project])).trim()
      expect(stopped).toBe('Stopped listening for irsim comments.')
      expect(received.some((one) => one.method === 'DELETE' && one.path === `/api/sessions/${session}`)).toBe(true)
      expect(await hook('PreInvocation')).toEqual({})
      expect(await hook('Stop')).toEqual({})
    })

    it('keeps a stopped conversation paused when it starts again', async () => {
      await hook('SessionStart')
      await bridge(['tool', 'stop', '--agent', 'antigravity', '--cwd', project])
      received.length = 0
      await hook('SessionStart')
      expect(received.some(({ path }) => path === '/api/sessions')).toBe(false)
      expect(await hook('PreInvocation')).toEqual({})
    })

    const inAgy = (pid: string) => ({ IRSIM_ANTIGRAVITY_PID: pid, IRSIM_CACHE_DIR: join(project, 'cache') })

    it('keeps one session per agy process, so stop acts on its own conversation', async () => {
      await hook('SessionStart', { conversationId: 'conv-a' }, inAgy('111'))
      await hook('SessionStart', { conversationId: 'conv-b' }, inAgy('222'))
      await hook('PreInvocation', { conversationId: 'conv-b' }, inAgy('222'))
      const dir = join(project, 'cache', 'antigravity-sessions')
      expect(readdirSync(dir).sort()).toEqual(['111', '222'])
      expect(JSON.parse(readFileSync(join(dir, '111'), 'utf8')).session).toBe('conv-a')
      received.length = 0
      await bridge(['tool', 'stop', '--agent', 'antigravity', '--cwd', project], '', inAgy('111'))
      expect(received.filter(({ method }) => method === 'DELETE').map(({ path }) => path)).toEqual([
        '/api/sessions/conv-a',
      ])
      expect(await hook('PreInvocation', { conversationId: 'conv-a' }, inAgy('111'))).toEqual({})
      expect(await hook('PreInvocation', { conversationId: 'conv-b' }, inAgy('222'))).toEqual({
        injectSteps: [{ systemMessage: { systemMessage: claimText } }],
      })
    })

    it('stops the conversation the hooks saw last, from any MCP working folder', async () => {
      await hook('SessionStart', { conversationId: 'conv-new' }, inAgy('333'))
      received.length = 0
      // The MCP server runs in the repo folder, not the project, and its env var is stale.
      const [out] = await mcp(
        'antigravity',
        [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'design_canvas', arguments: { action: 'stop' } } }],
        { ...inAgy('333'), ANTIGRAVITY_CONVERSATION_ID: 'conv-old' },
      )
      expect((out.result as { content: Array<{ text: string }> }).content[0].text).toBe(
        'Stopped listening for irsim comments.',
      )
      const deleted = received.filter(({ method }) => method === 'DELETE').map(({ path }) => path)
      expect(deleted).toContain('/api/sessions/conv-new')
      expect(deleted).not.toContain('/api/sessions/conv-old')
      // The MCP server exited, so the file of its agy pid is gone; the pause stays.
      expect(readdirSync(join(project, 'cache', 'antigravity-sessions'))).not.toContain('333')
      expect(await hook('PreInvocation', { conversationId: 'conv-new' }, inAgy('333'))).toEqual({})
    })

    it('continues on Stop when comments or lint errors exist and respects continuationActive and cancellation', async () => {
      await hook('SessionStart')
      expect(await hook('Stop', { terminationReason: 'NO_TOOL_CALL' })).toEqual({
        decision: 'continue',
        reason: claimText,
      })
      expect(await hook('Stop', { continuationActive: true })).toEqual({})
      expect(await hook('Stop', { terminationReason: 'USER_CANCELED' })).toEqual({})
      claimed = false
      lintReport = { ok: false, problems: lintProblems }
      touch(2_000)
      const first = await hook('Stop', { terminationReason: 'NO_TOOL_CALL' })
      expect(first.decision).toBe('continue')
      expect(first.reason).toContain('error design/canvas.json')
      expect((await hook('Stop')).decision).toBe('continue')
      expect(await hook('Stop')).toEqual({})
    })
  })
})

describe('agents', () => {
  it('treats a missing agent as the old Claude plugin', () => {
    expect(agentOf(undefined)).toBe('claude-code')
    expect(agentOf('codex')).toBe('codex')
    expect(agentOf('antigravity')).toBe('antigravity')
    expect(agentOf('unknown-agent')).toBe('other')
  })

  it('names each agent', () => {
    expect(agentName('command-code')).toBe('Command Code')
    expect(agentName('antigravity')).toBe('Antigravity')
    expect(agentName(undefined)).toBe('Claude Code')
  })
})
