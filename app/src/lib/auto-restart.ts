import { RESTART_CODE, exitProcess } from './restart'
import { isUpdating } from './update-state'
import { installedVersion, runningVersion } from './version-state'
import { newer } from './version-info'

type Timer = { unref?: () => unknown }

export type AutoRestartDeps = {
  installed?: () => Promise<string | null>
  running?: () => string
  exit?: (code: number) => void
  isUpdating?: () => boolean
  drain?: () => Promise<void>
  intervalMs?: number
  graceMs?: number
  enabled?: boolean
  setIntervalFn?: (callback: () => void, ms: number) => Timer
  setTimeoutFn?: (callback: () => void, ms: number) => Timer
  clearIntervalFn?: (timer: Timer) => void
  clearTimeoutFn?: (timer: Timer) => void
}

const FLAG = '__irsimAutoRestart'
const DRAIN_TIMEOUT_MS = 5000
const VERSION = /^\d+\.\d+\.\d+/

const drainWrites = async (): Promise<void> => {
  const { whenWritesIdle } = await import('./comments-store')
  await whenWritesIdle(DRAIN_TIMEOUT_MS)
}

const enabledByEnv = (): boolean =>
  process.env.IRSIM_AUTO_RESTART !== '0' &&
  Boolean(process.env.IRSIM_PREFIX) &&
  Boolean(process.env.IRSIM_LAUNCHER)

export const startAutoRestart = (deps: AutoRestartDeps = {}): (() => void) => {
  const {
    installed = installedVersion,
    running = runningVersion,
    exit = exitProcess,
    isUpdating: updating = isUpdating,
    drain = drainWrites,
    intervalMs = 30_000,
    graceMs = 2_000,
    enabled = enabledByEnv(),
    setIntervalFn = (callback, ms) => setInterval(callback, ms),
    setTimeoutFn = (callback, ms) => setTimeout(callback, ms),
    clearIntervalFn = (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
    clearTimeoutFn = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  } = deps
  const state = globalThis as Record<string, unknown>
  if (!enabled || state[FLAG]) return () => {}
  state[FLAG] = true

  let scheduled = false
  let exitTimer: Timer | null = null
  let checking = false

  const restart = () => {
    if (updating()) {
      exitTimer = setTimeoutFn(restart, graceMs)
      exitTimer.unref?.()
      return
    }
    drain()
      .catch(() => {})
      .then(() => exit(RESTART_CODE))
  }

  const interval = setIntervalFn(() => {
    if (scheduled || checking || updating()) return
    checking = true
    installed()
      .then((next) => {
        const current = running()
        if (scheduled || next === null || !VERSION.test(next) || !VERSION.test(current)) return
        if (!newer(next, current)) return
        scheduled = true
        clearIntervalFn(interval)
        exitTimer = setTimeoutFn(restart, graceMs)
        exitTimer.unref?.()
      })
      .catch(() => {})
      .finally(() => {
        checking = false
      })
  }, intervalMs)
  interval.unref?.()

  return () => {
    clearIntervalFn(interval)
    if (exitTimer !== null) clearTimeoutFn(exitTimer)
    state[FLAG] = false
  }
}
