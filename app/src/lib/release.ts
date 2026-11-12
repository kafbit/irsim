import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type Release = { version: string; url: string }

type Cache = { checkedAt: number; release: Release | null }

export type ReleaseDeps = {
  run?: () => Promise<string>
  cacheFile?: string
  now?: () => number
}

const REPO = 'kafbit/irsim'
const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_TTL_MS = 60 * 60 * 1000
const TIMEOUT_MS = 10_000

const globals = globalThis as { __irsimReleaseCheck?: Promise<Release | null> }

const cacheDir = (): string =>
  process.env.IRSIM_CACHE_DIR ||
  join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'irsim')

const runGh = (): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['release', 'view', '--repo', REPO, '--json', 'tagName,url'],
      { timeout: TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
  })

const parseRelease = (text: string): Release | null => {
  try {
    const body = JSON.parse(text) as { tagName?: unknown; url?: unknown }
    if (typeof body.tagName !== 'string' || typeof body.url !== 'string') return null
    const version = body.tagName.replace(/^v/, '')
    return version ? { version, url: body.url } : null
  } catch {
    return null
  }
}

const readCache = async (file: string): Promise<Cache | null> => {
  try {
    const body = JSON.parse(await readFile(file, 'utf8')) as Partial<Cache>
    if (typeof body.checkedAt !== 'number') return null
    const release = body.release
    if (release === null) return { checkedAt: body.checkedAt, release: null }
    if (release && typeof release.version === 'string' && typeof release.url === 'string')
      return { checkedAt: body.checkedAt, release }
    return null
  } catch {
    return null
  }
}

const writeCache = async (file: string, cache: Cache): Promise<void> => {
  try {
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(cache))
    await rename(temporary, file)
  } catch {}
}

const fresh = (cache: Cache, now: number): boolean => {
  const age = now - cache.checkedAt
  if (age < 0) return false
  return age < (cache.release ? SUCCESS_TTL_MS : FAILURE_TTL_MS)
}

const check = async (deps: ReleaseDeps): Promise<Release | null> => {
  const file = deps.cacheFile ?? join(cacheDir(), 'latest-release.json')
  const now = deps.now ?? Date.now
  const cached = await readCache(file)
  if (cached && fresh(cached, now())) return cached.release
  let release: Release | null = null
  try {
    release = parseRelease(await (deps.run ?? runGh)())
  } catch {
    release = null
  }
  await writeCache(file, { checkedAt: now(), release })
  return release
}

/**
 * The newest release of kafbit/irsim, read with `gh` because the repository is private. A success
 * is cached for 6 hours and a failure for 1 hour, in one file shared by every running canvas.
 */
export const latestRelease = (deps: ReleaseDeps = {}): Promise<Release | null> => {
  if (globals.__irsimReleaseCheck) return globals.__irsimReleaseCheck
  const pending = check(deps).finally(() => {
    if (globals.__irsimReleaseCheck === pending) delete globals.__irsimReleaseCheck
  })
  globals.__irsimReleaseCheck = pending
  return pending
}
