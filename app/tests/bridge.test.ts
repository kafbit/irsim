import { execFile, spawnSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agentName, agentOf } from '../src/lib/agents'

const CLI = fileURLToPath(new URL('../../bin/irsim', import.meta.url))
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')

type Received = { method: string; path: string; body: unknown }

describe('bridge', () => {
  let server: Server
  let port = 0
  const received: Received[] = []
  const claimText = 'Design canvas: 1 comment on page canvas-app (batch b1).'

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
          return json({ count: 1, text: claimText, comments: [], approvals: [] })
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
  })
})

describe('agents', () => {
  it('treats a missing agent as the old Claude plugin', () => {
    expect(agentOf(undefined)).toBe('claude-code')
    expect(agentOf('codex')).toBe('codex')
    expect(agentOf('unknown-agent')).toBe('other')
  })

  it('names each agent', () => {
    expect(agentName('command-code')).toBe('Command Code')
    expect(agentName(undefined)).toBe('Claude Code')
  })
})
