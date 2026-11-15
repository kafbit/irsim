import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import { launchChromium } from '../src/lib/board-check'
import { readCanvasPages } from '../src/lib/canvas-pages'
import { projectRoot } from '../src/lib/design-dir'
import { canvasPort } from '../src/lib/port'
import { renderThumb, thumbKeyOf } from '../src/lib/thumbs'
import { THUMB_MAX_AGE_MS, thumbFile, thumbsDir } from '../src/lib/thumbs-dir'
import { pruneThumbIndex, recordThumb, recordThumbIfMissing } from '../src/lib/thumbs-index'

const CONCURRENCY = 3

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

/** The directory is shared by every worktree, so an older thumbnail key may still be another one's current. Age decides. */
const pruneStale = async (dir: string): Promise<void> => {
  const cutoff = Date.now() - THUMB_MAX_AGE_MS
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.webp')) continue
    const path = join(dir, file)
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true })
  }
  await pruneThumbIndex()
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
        const { key } = await thumbKeyOf(target.name)
        const file = thumbFile(key)
        const out = join(dir, file)
        if (!force && (await exists(out))) {
          const now = new Date()
          await utimes(out, now, now)
          await recordThumbIfMissing(target.name, key)
          done('skip')
          continue
        }
        launching ??= launchChromium()
        await renderThumb(await launching, base, target, out)
        await recordThumb(target.name, key)
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
