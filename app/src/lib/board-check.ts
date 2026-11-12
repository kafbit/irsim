import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import { BOARD_NAME } from './board-name'
import { dataDir } from './data-dir'

export const READY_TIMEOUT_MS = 15_000
const SETTLE_MS = 300
const IMAGES_TIMEOUT_MS = 2_000
const IDLE_CLOSE_MS = 60_000

export const NO_CHROMIUM =
  'Chromium for Playwright is not installed: run npx playwright install chromium'

export const EMPTY_WARNING = 'the board renders no text and no image'

export type BoardTarget = { name: string; width: number; height: number }

/** What the page reported while the board booted. `fatal` is set when the board never became ready. */
export type Signals = {
  fatal?: string
  problems: string[]
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  empty: boolean
}

export type Inspection = Signals & { png?: Buffer }

export type CheckResult = {
  board: string
  ok: boolean
  ms: number
  errors: string[]
  warnings: string[]
  screenshot?: string
}

const noSignals = (): Signals => ({
  problems: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  empty: false,
})

/** A copy, so a listener that fires while the page closes cannot change a returned result. */
const snapshot = (signals: Signals): Signals => ({
  ...signals,
  problems: [...signals.problems],
  consoleErrors: [...signals.consoleErrors],
  pageErrors: [...signals.pageErrors],
  failedRequests: [...signals.failedRequests],
})

const unique = (values: string[]): string[] => [...new Set(values)]

/**
 * Console lines that repeat another signal: the runtime logs each problem as `[canvas:<where>]`,
 * and Chromium logs every failed request as `Failed to load resource`.
 */
const isEcho = (message: string): boolean =>
  message.startsWith('[canvas:') || message.startsWith('Failed to load resource')

export const summarize = (
  board: string,
  signals: Signals,
  ms: number,
  screenshot?: string,
): CheckResult => {
  // A problem is `<where>: <message>`; a page error or the boot error with the same message repeats it.
  const known = (message: string): boolean =>
    signals.problems.some((problem) => problem.endsWith(`: ${message}`))
  const fatal = signals.fatal?.replace(/^board error: /, '')
  const errors = unique([
    ...(signals.fatal && fatal !== undefined && !known(fatal) ? [signals.fatal] : []),
    ...signals.problems,
    ...signals.pageErrors.filter((message) => !known(message)),
    ...signals.consoleErrors.filter((message) => !isEcho(message)),
    ...signals.failedRequests,
  ])
  const warnings = signals.empty ? [EMPTY_WARNING] : []
  return {
    board,
    ok: errors.length === 0 && warnings.length === 0,
    ms,
    errors,
    warnings,
    ...(screenshot ? { screenshot } : {}),
  }
}

type BootState = {
  __checkDone: boolean
  __checkError?: string
  __checkProblems: string[]
}

/**
 * Opens `<base>/b/<board>` at the board's size and waits for the runtime's `ready` or `error`
 * message. The frame has no parent here, so the runtime posts to its own window.
 */
export const inspectBoard = async (
  browser: Browser,
  base: string,
  target: BoardTarget,
): Promise<Inspection> => {
  const signals = noSignals()
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
  })
  try {
    await context.addInitScript(() => {
      const state = window as unknown as BootState
      state.__checkDone = false
      state.__checkProblems = []
      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as {
          type?: string
          details?: { message?: string; problems?: { where: string; message: string }[] }
        } | null
        if (data?.type !== 'ready' && data?.type !== 'error') return
        state.__checkProblems.push(
          ...(data.details?.problems ?? []).map((problem) => `${problem.where}: ${problem.message}`),
        )
        if (data.type === 'error') state.__checkError = data.details?.message ?? 'board error'
        state.__checkDone = true
      })
      // Problems after `ready` (a later render, a timer) reach only the console: keep them too.
      const original = console.error.bind(console)
      console.error = (...args: unknown[]) => {
        const head = args[0]
        const where = typeof head === 'string' ? /^\[canvas:([^\]]+)\]$/.exec(head)?.[1] : undefined
        if (where && state.__checkDone) {
          const error = args[1] as { message?: unknown } | undefined
          state.__checkProblems.push(`${where}: ${String(error?.message ?? error)}`)
        }
        original(...args)
      }
    })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') signals.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => signals.pageErrors.push(error.message))
    page.on('requestfailed', (request) =>
      signals.failedRequests.push(`request failed: ${request.url()}`),
    )
    page.on('response', (response) => {
      if (response.status() >= 400)
        signals.failedRequests.push(`${response.status()} ${response.url()}`)
    })
    await page.goto(`${base}/b/${target.name}`, { waitUntil: 'load' })
    try {
      await page.waitForFunction(() => (window as unknown as BootState).__checkDone, undefined, {
        timeout: READY_TIMEOUT_MS,
      })
    } catch {
      signals.fatal = `the board was not ready after ${READY_TIMEOUT_MS / 1000} s (does it load ./support.js?)`
      return snapshot(signals)
    }
    const error = await page.evaluate(() => (window as unknown as BootState).__checkError)
    if (error) {
      signals.fatal = `board error: ${error}`
      signals.problems = await page.evaluate(() => (window as unknown as BootState).__checkProblems)
      return snapshot(signals)
    }
    await page.evaluate(
      (imagesTimeout) =>
        new Promise<void>((resolve) => {
          const images = Promise.all(
            [...document.images].map((image) => image.decode().catch(() => undefined)),
          )
          const frames = new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          )
          const cap = new Promise<void>((done) => setTimeout(done, imagesTimeout))
          void Promise.race([Promise.all([images, frames]), cap]).then(() => resolve())
        }),
      IMAGES_TIMEOUT_MS,
    )
    await page.waitForTimeout(SETTLE_MS)
    const state = await page.evaluate(() => {
      const own = window as unknown as BootState
      // Anything that paints: text, media, a background, a border or a shadow.
      const paints = [...document.body.querySelectorAll('*')].some((element) => {
        const box = element.getBoundingClientRect()
        if (box.width <= 0 || box.height <= 0) return false
        if (element.matches('img, svg, canvas, video, input, button, select, textarea'))
          return true
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden') return false
        return (
          (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
          style.backgroundImage !== 'none' ||
          style.boxShadow !== 'none' ||
          ['Top', 'Right', 'Bottom', 'Left'].some(
            (side) =>
              Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
              style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none',
          )
        )
      })
      return {
        problems: [...own.__checkProblems],
        empty: (document.body?.innerText ?? '').trim() === '' && !paints,
      }
    })
    signals.problems = state.problems
    signals.empty = state.empty
    const png = await page.screenshot({ type: 'png' })
    return { ...snapshot(signals), png }
  } finally {
    await context.close()
  }
}

export const launchChromium = async (): Promise<Browser> => {
  const { chromium } = await import('playwright-core')
  try {
    return await chromium.launch()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/Executable doesn't exist/.test(message)) throw new Error(NO_CHROMIUM)
    throw error
  }
}

type Shared = {
  browser?: Promise<Browser> | undefined
  timer?: ReturnType<typeof setTimeout> | undefined
  users: number
}

/** One browser per server process, kept on globalThis so dev reloads reuse it. */
const shared = (): Shared => {
  const holder = globalThis as unknown as { __irsimCheckBrowser?: Shared }
  holder.__irsimCheckBrowser ??= { users: 0 }
  return holder.__irsimCheckBrowser
}

const browserOf = (state: Shared): Promise<Browser> => {
  if (state.browser) return state.browser
  const launching = launchChromium().then((browser) => {
    // A crashed or killed Chromium is dropped, so the next check starts a new one.
    browser.on('disconnected', () => {
      if (state.browser === launching) state.browser = undefined
    })
    return browser
  })
  launching.catch(() => {
    if (state.browser === launching) state.browser = undefined
  })
  state.browser = launching
  return launching
}

/** Closes the browser a minute after the last check in flight ends. */
export const withBrowser = async <T>(use: (browser: Browser) => Promise<T>): Promise<T> => {
  const state = shared()
  clearTimeout(state.timer)
  state.timer = undefined
  state.users += 1
  try {
    return await use(await browserOf(state))
  } finally {
    state.users -= 1
    if (state.users === 0) {
      state.timer = setTimeout(() => {
        state.timer = undefined
        if (state.users > 0) return
        const closing = state.browser
        state.browser = undefined
        void closing?.then((open) => open.close()).catch(() => undefined)
      }, IDLE_CLOSE_MS)
      state.timer.unref?.()
    }
  }
}

export const checksDir = (): string => join(dataDir(), 'checks')

const CONCURRENCY = 3

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message.split('\n')[0] : String(error)) || 'check failed'

/** Checks the boards, three at a time, and writes a PNG per rendered board to `checksDir()`. */
export const checkBoards = async (base: string, targets: BoardTarget[]): Promise<CheckResult[]> =>
  withBrowser(async (browser) => {
    const dir = checksDir()
    await mkdir(dir, { recursive: true })
    const results: CheckResult[] = []
    const queue = [...targets]
    const worker = async (): Promise<void> => {
      for (let target = queue.shift(); target; target = queue.shift()) {
        const started = performance.now()
        let inspection: Inspection
        if (!BOARD_NAME.test(target.name)) {
          inspection = { ...noSignals(), fatal: `invalid board name ${target.name}` }
        } else {
          try {
            inspection = await inspectBoard(browser, base, target)
          } catch (error) {
            inspection = { ...noSignals(), fatal: firstLine(error) }
          }
        }
        let screenshot: string | undefined
        if (inspection.png) {
          screenshot = join(dir, `${target.name}.png`)
          // Write then rename, so a reader never sees half a file when two checks overlap.
          const temporary = `${screenshot}.${process.pid}.${Math.random().toString(36).slice(2)}`
          await writeFile(temporary, inspection.png)
          await rename(temporary, screenshot)
        }
        const ms = Math.round(performance.now() - started)
        results.push(summarize(target.name, inspection, ms, screenshot))
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    const order = new Map(targets.map((target, index) => [target.name, index]))
    return results.sort((a, b) => (order.get(a.board) ?? 0) - (order.get(b.board) ?? 0))
  })
