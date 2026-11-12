import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAutoRestart } from '../src/lib/auto-restart'

const KEYS = ['IRSIM_PREFIX', 'IRSIM_LAUNCHER', 'IRSIM_AUTO_RESTART'] as const
const state = globalThis as Record<string, unknown>

describe('startAutoRestart', () => {
  const saved: Record<string, string | undefined> = {}
  let stop: () => void = () => {}
  let installed: string | null
  let updating: boolean
  let exit: ReturnType<typeof vi.fn<(code: number) => void>>
  let running: string

  let now: number
  let tasks: { at: number; every: number | null; callback: () => void }[]

  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = tasks.filter((task) => task.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      now = due.at
      if (due.every === null) tasks = tasks.filter((task) => task !== due)
      else due.at += due.every
      due.callback()
      for (let i = 0; i < 5; i++) await Promise.resolve()
    }
    now = end
  }

  const schedule = (every: boolean) => (callback: () => void, ms: number) => {
    const task = { at: now + ms, every: every ? ms : null, callback }
    tasks.push(task)
    return Object.assign(task, { unref: () => task })
  }

  const unschedule = (timer: object) => {
    tasks = tasks.filter((task) => task !== timer)
  }

  const start = (extra: Parameters<typeof startAutoRestart>[0] = {}) => {
    stop = startAutoRestart({
      installed: async () => installed,
      running: () => running,
      drain: async () => {},
      exit,
      isUpdating: () => updating,
      intervalMs: 1000,
      graceMs: 200,
      enabled: true,
      setIntervalFn: schedule(true),
      setTimeoutFn: schedule(false),
      clearIntervalFn: unschedule,
      clearTimeoutFn: unschedule,
      ...extra,
    })
    return stop
  }

  beforeEach(() => {
    now = 0
    tasks = []
    for (const key of KEYS) saved[key] = process.env[key]
    delete state.__irsimAutoRestart
    installed = '0.1.0'
    running = '0.1.0'
    updating = false
    exit = vi.fn()
  })

  afterEach(() => {
    stop()
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    delete state.__irsimAutoRestart
  })

  it('does not exit while installed equals running', async () => {
    start()
    await advance(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('exits once with the restart code after the grace period when installed differs', async () => {
    installed = '0.2.0'
    start()
    await advance(1000)
    expect(exit).not.toHaveBeenCalled()
    await advance(200)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(75)
    await advance(10_000)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('does not exit while an update runs and exits once it clears', async () => {
    installed = '0.2.0'
    updating = true
    start()
    await advance(5000)
    expect(exit).not.toHaveBeenCalled()
    updating = false
    await advance(1200)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('re-arms the grace timer instead of exiting when an update starts inside the grace window', async () => {
    installed = '0.2.0'
    start()
    await advance(1000)
    updating = true
    await advance(1000)
    expect(exit).not.toHaveBeenCalled()
    updating = false
    await advance(200)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('does not restart when the installed version is older than the running one', async () => {
    installed = '0.1.0'
    running = '0.2.0'
    start()
    await advance(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('does not restart when the running version is unknown', async () => {
    running = 'unknown'
    installed = '0.2.0'
    start()
    await advance(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('awaits the drain before exiting', async () => {
    installed = '0.2.0'
    let release: () => void = () => {}
    const drain = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    start({ drain })
    await advance(1200)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
    release()
    await advance(0)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(exit).toHaveBeenCalledWith(75)
  })

  it('still exits when the drain rejects', async () => {
    installed = '0.2.0'
    start({ drain: async () => Promise.reject(new Error('stuck')) })
    await advance(1200)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(exit).toHaveBeenCalledWith(75)
  })

  it('does nothing on a second call in the same process', async () => {
    installed = '0.2.0'
    start()
    const second = vi.fn()
    start({ exit: second })
    await advance(1200)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('does nothing when the installed version is unknown', async () => {
    installed = null
    start()
    await advance(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('is disabled when IRSIM_PREFIX is unset', async () => {
    delete process.env.IRSIM_PREFIX
    process.env.IRSIM_LAUNCHER = '/bin/irsim'
    installed = '0.2.0'
    start({ enabled: undefined })
    await advance(5000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('is disabled when IRSIM_LAUNCHER is unset', async () => {
    process.env.IRSIM_PREFIX = '/prefix'
    delete process.env.IRSIM_LAUNCHER
    installed = '0.2.0'
    start({ enabled: undefined })
    await advance(5000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('is disabled when IRSIM_AUTO_RESTART is 0', async () => {
    process.env.IRSIM_PREFIX = '/prefix'
    process.env.IRSIM_LAUNCHER = '/bin/irsim'
    process.env.IRSIM_AUTO_RESTART = '0'
    installed = '0.2.0'
    start({ enabled: undefined })
    await advance(5000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('is enabled by the environment', async () => {
    process.env.IRSIM_PREFIX = '/prefix'
    process.env.IRSIM_LAUNCHER = '/bin/irsim'
    delete process.env.IRSIM_AUTO_RESTART
    installed = '0.2.0'
    start({ enabled: undefined })
    await advance(1200)
    expect(exit).toHaveBeenCalledWith(75)
  })
})
