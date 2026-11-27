// Keeps `irsim serve` healthy when it runs `next dev` from a git checkout of irsim.
// A pull or a branch switch changes hundreds of files under a running dev server, and its
// Turbopack cache then answers every page load with "HMR hash mismatch", so the page reloads
// forever. The launcher watches the checkout and restarts the dev server on a clean cache.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, rmSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const git = (root, args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
  } catch {
    return null
  }
}

// The commit the checkout is on, or null when the folder is not a git checkout.
export const checkoutHead = (root) => git(root, ['rev-parse', 'HEAD']) || null

// The reflog subject of the last HEAD move, for example "pull: Fast-forward" or "commit: fix".
export const lastHeadMove = (root) => git(root, ['reflog', '-1', '--format=%gs']) || ''

// A new commit leaves the files on disk as they were, so the server does not need a restart.
// Every other move (pull, checkout, switch, merge, rebase, reset, cherry-pick) rewrites files.
export const rewritesFiles = (move) => !/^commit( \((initial|amend)\))?:/.test(move)

export const devCacheDir = (app) => join(app, '.next', 'dev')

export const clearDevCache = (app) => {
  const dir = devCacheDir(app)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}

const mtime = (path) => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

// bun install touches node_modules, so a lockfile newer than node_modules was not installed yet.
export const depsStale = (app) => {
  const lock = mtime(join(app, 'bun.lock'))
  const modules = mtime(join(app, 'node_modules'))
  return lock !== null && (modules === null || lock > modules)
}

export const installDeps = (app, run = spawnSync) => {
  const result = run('bun', ['install'], { cwd: app, stdio: 'inherit' })
  if (result.error || result.status !== 0) return false
  const now = new Date()
  try {
    utimesSync(join(app, 'node_modules'), now, now)
  } catch {}
  return true
}

// Calls onMove(head) once a new HEAD has stayed the same for two polls in a row and the move
// rewrote files. Returns a function that stops the watch.
export const watchCheckout = (root, onMove, deps = {}) => {
  const {
    head = () => checkoutHead(root),
    move = () => lastHeadMove(root),
    everyMs = 2000,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = deps
  let current = head()
  let pending = null
  const timer = setIntervalFn(() => {
    const next = head()
    if (next === null || next === current) {
      pending = null
      return
    }
    if (pending !== next) {
      pending = next
      return
    }
    pending = null
    current = next
    if (rewritesFiles(move())) onMove(next)
  }, everyMs)
  timer?.unref?.()
  return () => clearIntervalFn(timer)
}
