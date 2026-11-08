import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'

export const PORT_MIN = 3200
export const PORT_COUNT = 100

export type PortState = { state: 'free' } | { state: 'canvas'; root: string } | { state: 'busy' }
export type Probe = (port: number) => Promise<PortState>

const validPort = (value: unknown): number | null => {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

/** Maps a worktree root to its preferred port in 3200..3299 with FNV-1a, so the same path always starts at the same port. */
export const hashPort = (root: string): number => {
  let hash = 0x811c9dc5
  for (const char of root) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return PORT_MIN + (hash % PORT_COUNT)
}

const sameRoot = (a: string, b: string): boolean => {
  const real = (path: string): string => {
    try {
      return realpathSync(path)
    } catch {
      return path
    }
  }
  return real(a) === real(b)
}

/**
 * Picks the port for one worktree. `DESIGN_PORT` wins. Otherwise it walks the recorded port, then
 * the hashed port and the ports after it, and takes the first that is free or already serves this
 * worktree's canvas. Throws when all 100 ports are taken by something else.
 */
export const resolvePort = async (input: {
  root: string
  env?: string | undefined
  recorded?: number | null
  probe: Probe
}): Promise<number> => {
  const forced = validPort(input.env)
  if (forced !== null) return forced
  const start = hashPort(input.root)
  const candidates = [
    ...(input.recorded ? [input.recorded] : []),
    ...Array.from(
      { length: PORT_COUNT },
      (_, step) => PORT_MIN + ((start - PORT_MIN + step) % PORT_COUNT),
    ),
  ]
  for (const port of new Set(candidates)) {
    const found = await input.probe(port)
    if (found.state === 'free') return port
    if (found.state === 'canvas' && sameRoot(found.root, input.root)) return port
  }
  throw new Error(`no free canvas port in ${PORT_MIN}..${PORT_MIN + PORT_COUNT - 1}`)
}

const tcpOpen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: 'localhost', timeout: 400 })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('timeout', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })

/** Tells whether a port is free, serves a canvas (and whose), or is held by something else. */
export const probePort: Probe = async (port) => {
  if (!(await tcpOpen(port))) return { state: 'free' }
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    const body = (await response.json()) as { ok?: unknown; root?: unknown }
    if (body.ok === true && typeof body.root === 'string')
      return { state: 'canvas', root: body.root }
  } catch {
    return { state: 'busy' }
  }
  return { state: 'busy' }
}

export const portFile = (root: string): string => join(root, 'apps/design/.data/port')

const readRecorded = (root: string): number | null => {
  try {
    return validPort(readFileSync(portFile(root), 'utf8').trim())
  } catch {
    return null
  }
}

/** Resolves the worktree's port and records it in `apps/design/.data/port` when it changed. */
export const canvasPort = async (root: string): Promise<number> => {
  const recorded = readRecorded(root)
  const port = await resolvePort({ root, env: process.env.DESIGN_PORT, recorded, probe: probePort })
  if (port !== recorded && !validPort(process.env.DESIGN_PORT)) {
    mkdirSync(dirname(portFile(root)), { recursive: true })
    writeFileSync(portFile(root), `${port}\n`)
  }
  return port
}

/** The git worktree root of a directory. Throws outside a repository. */
export const repoRoot = (cwd: string = process.cwd()): string =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
