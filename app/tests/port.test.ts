import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PORT_COUNT,
  PORT_MIN,
  canvasPort,
  hashPort,
  probePort,
  resolvePort,
  type Probe,
} from '../src/lib/port'

const free: Probe = async () => ({ state: 'free' })
const taken =
  (ports: Record<number, { root?: string }>): Probe =>
  async (port) => {
    const found = ports[port]
    if (!found) return { state: 'free' }
    return found.root ? { state: 'canvas', root: found.root } : { state: 'busy' }
  }

describe('hashPort', () => {
  it('is stable and stays inside 3200..3299', () => {
    const root = '/home/me/.herdr/worktrees/CRM/leads-table-and-others'
    expect(hashPort(root)).toBe(hashPort(root))
    for (const path of [root, '/a', '/b/c', '/d/e/f', '']) {
      const port = hashPort(path)
      expect(port).toBeGreaterThanOrEqual(PORT_MIN)
      expect(port).toBeLessThan(PORT_MIN + PORT_COUNT)
    }
  })

  it('spreads different worktrees over different ports', () => {
    const ports = new Set(Array.from({ length: 20 }, (_, i) => hashPort(`/work/tree-${i}`)))
    expect(ports.size).toBeGreaterThan(10)
  })
})

describe('resolvePort', () => {
  const root = '/work/one'

  it('IRSIM_PORT wins without probing', async () => {
    const probe: Probe = async () => {
      throw new Error('probed')
    }
    expect(await resolvePort({ root, env: '4555', probe })).toBe(4555)
  })

  it('ignores an invalid IRSIM_PORT', async () => {
    expect(await resolvePort({ root, env: 'abc', probe: free })).toBe(hashPort(root))
  })

  it('starts at the hashed port', async () => {
    expect(await resolvePort({ root, probe: free })).toBe(hashPort(root))
  })

  it('keeps the recorded port while it is free or serves this worktree', async () => {
    expect(await resolvePort({ root, recorded: 3290, probe: free })).toBe(3290)
    expect(await resolvePort({ root, recorded: 3290, probe: taken({ 3290: { root } }) })).toBe(3290)
  })

  it('moves on from a port that another worktree serves', async () => {
    const start = hashPort(root)
    const port = await resolvePort({ root, probe: taken({ [start]: { root: '/work/two' } }) })
    expect(port).toBe(PORT_MIN + ((start - PORT_MIN + 1) % PORT_COUNT))
  })

  it('moves on from a recorded port that something else holds', async () => {
    const port = await resolvePort({ root, recorded: 3290, probe: taken({ 3290: {} }) })
    expect(port).not.toBe(3290)
  })

  it('wraps past 3299 back to 3200', async () => {
    const all: Record<number, { root?: string }> = {}
    for (let port = PORT_MIN; port < PORT_MIN + PORT_COUNT; port += 1) all[port] = {}
    delete all[PORT_MIN]
    const last = PORT_MIN + PORT_COUNT - 1
    const rootAtEnd = Array.from({ length: 5000 }, (_, i) => `/w/${i}`).find(
      (path) => hashPort(path) === last,
    )
    if (!rootAtEnd) throw new Error('no root hashes to the last port')
    expect(await resolvePort({ root: rootAtEnd, probe: taken({ ...all, [last]: {} }) })).toBe(
      PORT_MIN,
    )
  })

  it('throws when every port is taken', async () => {
    const probe: Probe = async () => ({ state: 'busy' })
    await expect(resolvePort({ root, probe })).rejects.toThrow('no free canvas port')
  })
})

describe('probePort', () => {
  let server: Server | null = null
  let dir: string | null = null
  afterEach(() => {
    server?.close()
    server = null
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  const listen = (handler: Parameters<typeof createServer>[1]): Promise<number> =>
    new Promise((resolve) => {
      const created = createServer(handler)
      server = created
      created.listen(0, () => resolve((created.address() as { port: number }).port))
    })

  it('reads the root of a canvas from /api/health', async () => {
    const port = await listen((_, res) =>
      res.end(JSON.stringify({ ok: true, version: 1, root: '/w' })),
    )
    expect(await probePort(port)).toEqual({ state: 'canvas', root: '/w' })
  })

  it('calls a listener that is not a canvas busy', async () => {
    const port = await listen((_, res) => res.end('hello'))
    expect(await probePort(port)).toEqual({ state: 'busy' })
  })

  it('calls a port with no listener free', async () => {
    const port = await listen((_, res) => res.end())
    server?.close()
    server = null
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await probePort(port)).toEqual({ state: 'free' })
  })
})

let dir: string
describe('canvasPort file', () => {
  const names = ['IRSIM_PORT', 'DESIGN_PORT'] as const
  const saved = names.map((name) => process.env[name])
  afterEach(() => {
    names.forEach((name, at) => {
      const value = saved[at]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
    rmSync(dir, { recursive: true, force: true })
  })

  it('records the chosen port in .irsim/port and reuses it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'irsim-port-'))
    names.forEach((name) => delete process.env[name])
    const first = await canvasPort(dir)
    expect(readFileSync(join(dir, '.irsim/port'), 'utf8').trim()).toBe(String(first))
    expect(await canvasPort(dir)).toBe(first)
  })

  it('IRSIM_PORT is used and not recorded', async () => {
    dir = mkdtempSync(join(tmpdir(), 'irsim-port-'))
    delete process.env.DESIGN_PORT
    process.env.IRSIM_PORT = '4555'
    expect(await canvasPort(dir)).toBe(4555)
    expect(existsSync(join(dir, '.irsim/port'))).toBe(false)
  })

  it('the legacy DESIGN_PORT still applies when IRSIM_PORT is unset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'irsim-port-'))
    delete process.env.IRSIM_PORT
    process.env.DESIGN_PORT = '4556'
    expect(await canvasPort(dir)).toBe(4556)
  })
})
