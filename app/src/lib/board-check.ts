import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import { dataDir } from './data-dir'

export const READY_TIMEOUT_MS = 15_000
const SETTLE_MS = 300
const IDLE_CLOSE_MS = 60_000

export const NO_CHROMIUM =
  'Chromium for Playwright is not installed: run npx playwright install chromium'

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

const unique = (values: string[]): string[] => [...new Set(values)]

/** The runtime logs each problem as `[canvas:<where>] ...` too; the `problems` list already has it. */
const isRuntimeEcho = (message: string): boolean => message.startsWith('[canvas:')

export const summarize = (
  board: string,
  signals: Signals,
  ms: number,
  screenshot?: string,
): CheckResult => {
  const errors = unique([
    ...(signals.fatal ? [signals.fatal] : []),
    ...signals.problems,
    ...signals.pageErrors,
    ...signals.consoleErrors.filter((message) => !isRuntimeEcho(message)),
    ...signals.failedRequests,
  ])
  const warnings = signals.empty ? ['the board renders no text and no image'] : []
  return {
    board,
    ok: errors.length === 0 && warnings.length === 0,
    ms,
    errors,
    warnings,
    ...(screenshot ? { screenshot } : {}),
  }
}

type BootState = { __checkDone: boolean; __checkError?: string; __checkProblems?: string[] }

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
      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as {
          type?: string
          details?: { message?: string; problems?: { where: string; message: string }[] }
        } | null
        if (data?.type !== 'ready' && data?.type !== 'error') return
        state.__checkProblems = (data.details?.problems ?? []).map(
          (problem) => `${problem.where}: ${problem.message}`,
        )
        if (data.type === 'error') state.__checkError = data.details?.message ?? 'board error'
        state.__checkDone = true
      })
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
      return signals
    }
    const state = await page.evaluate(() => {
      const own = window as unknown as BootState
      const media = [...document.querySelectorAll('img, svg, canvas, video, input, button')]
      const hasMedia = media.some((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      })
      return {
        error: own.__checkError,
        problems: own.__checkProblems ?? [],
        empty: (document.body?.innerText ?? '').trim() === '' && !hasMedia,
      }
    })
    signals.problems = state.problems
    signals.empty = state.empty
    if (state.error) {
      signals.fatal = `board error: ${state.error}`
      return signals
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await page.waitForTimeout(SETTLE_MS)
    return { ...signals, png: await page.screenshot({ type: 'png' }) }
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
}

/** One browser per server process, closed after a minute without a check. Kept on globalThis so dev reloads reuse it. */
const shared = (): Shared => {
  const holder = globalThis as unknown as { __irsimCheckBrowser?: Shared }
  holder.__irsimCheckBrowser ??= {}
  return holder.__irsimCheckBrowser
}

const withBrowser = async <T>(use: (browser: Browser) => Promise<T>): Promise<T> => {
  const state = shared()
  if (state.timer) clearTimeout(state.timer)
  state.browser ??= launchChromium().catch((error: unknown) => {
    state.browser = undefined
    throw error
  })
  const browser = await state.browser
  try {
    return await use(browser)
  } finally {
    state.timer = setTimeout(() => {
      const closing = state.browser
      state.browser = undefined
      void closing?.then((open) => open.close()).catch(() => undefined)
    }, IDLE_CLOSE_MS)
    state.timer.unref?.()
  }
}

export const checksDir = (): string => join(dataDir(), 'checks')

const CONCURRENCY = 3

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
        try {
          inspection = await inspectBoard(browser, base, target)
        } catch (error) {
          const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
          inspection = { ...noSignals(), fatal: message || 'check failed' }
        }
        let screenshot: string | undefined
        if (inspection.png) {
          screenshot = join(dir, `${target.name}.png`)
          await writeFile(screenshot, inspection.png)
        }
        const ms = Math.round(performance.now() - started)
        results.push(summarize(target.name, inspection, ms, screenshot))
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    const order = new Map(targets.map((target, index) => [target.name, index]))
    return results.sort((a, b) => (order.get(a.board) ?? 0) - (order.get(b.board) ?? 0))
  })

