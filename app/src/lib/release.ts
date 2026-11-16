import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { cacheRoot } from './cache-root'

export type Release = { version: string; url: string }

type Cache = { checkedAt: number; release: Release | null }

export type ReleaseDeps = {
  run?: () => Promise<string>
  cacheFile?: string
  now?: () => number
  fresh?: boolean
}

const REPO = 'kafbit/irsim'
const SUCCESS_TTL_MS = 15 * 60 * 1000
const FAILURE_TTL_MS = 60 * 60 * 1000
const TIMEOUT_MS = 10_000

const globals = globalThis as { __irsimReleaseCheck?: Promise<Release | null> }

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
  const file = deps.cacheFile ?? join(cacheRoot(), 'latest-release.json')
  const now = deps.now ?? Date.now
  const cached = await readCache(file)
  if (!deps.fresh && cached && fresh(cached, now())) return cached.release
  let release: Release | null = null
  try {
    release = parseRelease(await (deps.run ?? runGh)())
  } catch {
    release = null
  }
  if (release === null && cached?.release) {
    await writeCache(file, { checkedAt: now(), release: cached.release })
    return cached.release
  }
  await writeCache(file, { checkedAt: now(), release })
  return release
}

export const latestRelease = (deps: ReleaseDeps = {}): Promise<Release | null> => {
  if (globals.__irsimReleaseCheck) return globals.__irsimReleaseCheck
  const pending = check(deps).finally(() => {
    if (globals.__irsimReleaseCheck === pending) delete globals.__irsimReleaseCheck
  })
  globals.__irsimReleaseCheck = pending
  return pending
}
