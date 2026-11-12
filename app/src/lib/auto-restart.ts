import { RESTART_CODE, exitProcess } from './restart'
import { isUpdating } from './update-state'
import { installedVersion, runningVersion } from './version-state'

type Timer = { unref?: () => unknown }

export type AutoRestartDeps = {
  installed?: () => Promise<string | null>
  running?: () => string
  exit?: (code: number) => void
  isUpdating?: () => boolean
  intervalMs?: number
  graceMs?: number
  enabled?: boolean
  setIntervalFn?: (callback: () => void, ms: number) => Timer
  setTimeoutFn?: (callback: () => void, ms: number) => Timer
  clearIntervalFn?: (timer: Timer) => void
  clearTimeoutFn?: (timer: Timer) => void
}

const FLAG = '__irsimAutoRestart'

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

  const interval = setIntervalFn(() => {
    if (scheduled || checking || updating()) return
    checking = true
    installed()
      .then((next) => {
        if (scheduled || next === null || next === running()) return
        scheduled = true
        clearIntervalFn(interval)
        exitTimer = setTimeoutFn(() => exit(RESTART_CODE), graceMs)
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
