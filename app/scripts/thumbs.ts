import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser } from '@playwright/test'
import sharp from 'sharp'
import { readCanvasPages, type CanvasBoard } from '../src/lib/canvas-pages'
import { closureOf } from '../src/lib/closure'
import { projectRoot } from '../src/lib/design-dir'
import { canvasPort } from '../src/lib/port'
import { THUMB_MAX_AGE_MS, THUMB_WIDTH, thumbFile, thumbsDir } from '../src/lib/thumbs-dir'

const CONCURRENCY = 3
const READY_TIMEOUT_MS = 15_000

type Result = { board: string; status: 'new' | 'skip' | 'fail'; ms: number; error?: string }

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const force = process.argv.includes('--force')
const base = arg('--base') ?? `http://localhost:${await canvasPort(projectRoot())}`
const pageId = arg('--page')
const boardName = arg('--board')

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  )

/** The directory is shared by every worktree, so an older hash may still be another one's current. Age decides. */
const pruneStale = async (dir: string): Promise<void> => {
  const cutoff = Date.now() - THUMB_MAX_AGE_MS
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.webp')) continue
    const path = join(dir, file)
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true })
  }
}

const render = async (browser: Browser, target: CanvasBoard, out: string): Promise<void> => {
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
  })
  try {
    await context.addInitScript(() => {
      const state = window as unknown as { __thumbDone: boolean; __thumbError?: string }
      state.__thumbDone = false
      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string; message?: string } | null
        if (data?.type === 'ready') state.__thumbDone = true
        if (data?.type === 'error') {
          state.__thumbError = data.message ?? 'board reported an error'
          state.__thumbDone = true
        }
      })
    })
    const page = await context.newPage()
    await page.goto(`${base}/b/${target.name}`, { waitUntil: 'load' })
    await page.waitForFunction(() => (window as unknown as { __thumbDone: boolean }).__thumbDone, {
      timeout: READY_TIMEOUT_MS,
    })
    const reported = await page.evaluate(
      () => (window as unknown as { __thumbError?: string }).__thumbError,
    )
    if (reported) throw new Error(`board posted error: ${reported}`)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await page.waitForTimeout(300)
    const png = await page.screenshot({ type: 'png' })
    await sharp(png).resize({ width: THUMB_WIDTH }).webp({ quality: 70 }).toFile(out)
  } finally {
    await context.close()
  }
}

const main = async (): Promise<void> => {
  const pages = await readCanvasPages()
  if (pageId && !pages.some((page) => page.id === pageId)) {
    console.error(`no page named ${pageId}`)
    process.exit(2)
  }
  const targets = pages
    .filter((page) => !pageId || page.id === pageId)
    .flatMap((page) => page.boards)
    .filter((board) => !boardName || board.name === boardName)
  if (targets.length === 0) {
    console.error('no board matches')
    process.exit(2)
  }
  const dir = thumbsDir()
  await mkdir(dir, { recursive: true })
  const results: Result[] = []
  const queue = [...targets]
  let launching: Promise<Browser> | undefined
  const worker = async (): Promise<void> => {
    for (;;) {
      const target = queue.shift()
      if (!target) return
      const started = performance.now()
      const done = (status: Result['status'], error?: string) =>
        results.push({
          board: target.name,
          status,
          ms: Math.round(performance.now() - started),
          ...(error ? { error } : {}),
        })
      try {
        const { hash } = await closureOf(target.name)
        const file = thumbFile(target.name, hash)
        const out = join(dir, file)
        if (!force && (await exists(out))) {
          const now = new Date()
          await utimes(out, now, now)
          done('skip')
          continue
        }
        launching ??= chromium.launch()
        await render(await launching, target, out)
        done('new')
      } catch (error) {
        done('fail', error instanceof Error ? error.message.split('\n')[0] : String(error))
      }
    }
  }
  const started = performance.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  await (await launching)?.close()
  await pruneStale(dir)
  results.sort((a, b) => (a.board < b.board ? -1 : 1))
  const width = Math.max(...results.map((result) => result.board.length), 5)
  console.log(`${'board'.padEnd(width)}  status  ms`)
  for (const result of results) {
    console.log(`${result.board.padEnd(width)}  ${result.status.padEnd(6)}  ${result.ms}`)
  }
  const count = (status: Result['status']) => results.filter((r) => r.status === status).length
  console.log(
    `new ${count('new')}, skip ${count('skip')}, fail ${count('fail')}, ${Math.round(performance.now() - started)} ms`,
  )
  const failures = results.filter((result) => result.status === 'fail')
  if (failures.length > 0) {
    console.error('failures:')
    for (const failure of failures) console.error(`  ${failure.board}: ${failure.error}`)
    process.exit(1)
  }
}

await main()
