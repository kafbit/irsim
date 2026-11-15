import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import sharp from 'sharp'
import { NO_CHROMIUM, inspectBoard, withBrowser, type BoardTarget } from './board-check'
import { readCanvasPages } from './canvas-pages'
import { targetOf } from './check-route'
import { closureOf } from './closure'
import { emit } from './events'
import { THUMB_WIDTH, thumbFile, thumbKey, thumbsDir } from './thumbs-dir'
import { recordThumb } from './thumbs-index'

const CONCURRENCY = 2

type Job = { key: string; board: string; base: string; target: BoardTarget }

type Queue = {
  waiting: Job[]
  keys: Set<string>
  boards: Map<string, Set<string>>
  running: number
  failed: Map<string, string>
  noChromium?: string | undefined
}

/** One queue per server process, kept on globalThis so dev reloads share it. */
const queue = (): Queue => {
  const holder = globalThis as unknown as { __irsimThumbQueue?: Queue }
  holder.__irsimThumbQueue ??= {
    waiting: [],
    keys: new Set(),
    boards: new Map(),
    running: 0,
    failed: new Map(),
  }
  holder.__irsimThumbQueue.boards ??= new Map()
  return holder.__irsimThumbQueue
}

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message.split('\n')[0] : String(error)) || 'render failed'

/** Renders the board to a WebP of `THUMB_WIDTH` at `out`. The file appears only when complete. */
export const renderThumb = async (
  browser: Browser,
  base: string,
  target: BoardTarget,
  out: string,
): Promise<void> => {
  const inspection = await inspectBoard(browser, base, target)
  if (inspection.fatal) throw new Error(inspection.fatal)
  if (!inspection.png) throw new Error('no screenshot')
  const temporary = `${out}.${process.pid}.${Math.random().toString(36).slice(2)}`
  try {
    await sharp(inspection.png).resize({ width: THUMB_WIDTH }).webp({ quality: 70 }).toFile(temporary)
    await rename(temporary, out)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  )

const run = async (state: Queue, job: Job): Promise<void> => {
  const waiting = () => [...(state.boards.get(job.key) ?? new Set([job.board]))]
  try {
    if (state.noChromium) throw new Error(state.noChromium)
    const dir = thumbsDir()
    const out = join(dir, thumbFile(job.key))
    if (!(await exists(out))) {
      await mkdir(dir, { recursive: true })
      await withBrowser((browser) => renderThumb(browser, job.base, job.target, out))
    }
    for (const board of waiting()) {
      await recordThumb(board, job.key).catch(() => {})
      emit({ event: 'thumb', data: { board, ok: true } })
    }
  } catch (error) {
    const message = firstLine(error)
    if (message === NO_CHROMIUM || message.startsWith('IRSIM_BROWSER ')) state.noChromium = message
    state.failed.set(job.key, message)
    for (const board of waiting()) emit({ event: 'thumb', data: { board, ok: false } })
  }
}

const pump = (state: Queue): void => {
  while (state.running < CONCURRENCY) {
    const job = state.waiting.shift()
    if (!job) return
    state.running += 1
    void run(state, job).finally(() => {
      state.running -= 1
      state.keys.delete(job.key)
      state.boards.delete(job.key)
      pump(state)
    })
  }
}

/** The thumbnail key of the board's current version: its render hash and the size it renders at. */
export const thumbKeyOf = async (
  board: string,
): Promise<{ render: string; key: string; target: BoardTarget }> => {
  const { render } = await closureOf(board)
  const placed = (await readCanvasPages())
    .flatMap((page) => page.boards)
    .find((candidate) => candidate.name === board)
  const target = targetOf(board, placed)
  return { render, key: thumbKey(render, target), target }
}

/**
 * Queues a render of the board's current version, two at a time. A thumbnail key already queued or
 * running is not added again. A version that failed, or any board once Chromium is missing,
 * returns `'failed'` and is not retried in this process.
 */
export const enqueueThumb = async (board: string, base: string): Promise<'queued' | 'failed'> => {
  const state = queue()
  if (state.noChromium) return 'failed'
  const { key, target } = await thumbKeyOf(board)
  if (state.failed.has(key) || state.noChromium) return 'failed'
  if (state.keys.has(key)) {
    state.boards.get(key)?.add(board)
    return 'queued'
  }
  state.keys.add(key)
  state.boards.set(key, new Set([board]))
  state.waiting.push({ key, board, base, target })
  pump(state)
  return 'queued'
}

/** Why the version of the board with this thumbnail key will not render in this process, if it will not. */
export const thumbFailure = (_board: string, key: string): string | undefined =>
  queue().noChromium ?? queue().failed.get(key)

/** Lets the version try again, after a failure. */
export const clearThumbFailure = (_board: string, key: string): void => {
  queue().failed.delete(key)
}
