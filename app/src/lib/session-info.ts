import { execFile } from 'node:child_process'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Session } from './comments-types'

const run = promisify(execFile)

const TAIL_BYTES = 256 * 1024
const BRANCH_TTL_MS = 10_000

type TitleEntry = { mtimeMs: number; title: string | null }
type BranchEntry = { at: number; branch: string | null }

const titles = new Map<string, TitleEntry>()
const branches = new Map<string, BranchEntry>()
let projectDirs: string[] | null = null
let projectDirsRoot = ''

export const claudeDir = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

export const projectSlug = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-')

const transcriptPath = async (id: string, cwd: string): Promise<string | null> => {
  const root = join(claudeDir(), 'projects')
  const direct = join(root, projectSlug(cwd), `${id}.jsonl`)
  if (await stat(direct).then(() => true, () => false)) return direct
  if (projectDirs === null || projectDirsRoot !== root) {
    projectDirs = await readdir(root).catch(() => [])
    projectDirsRoot = root
  }
  for (const dir of projectDirs) {
    const file = join(root, dir, `${id}.jsonl`)
    if (await stat(file).then(() => true, () => false)) return file
  }
  return null
}

const readTail = async (file: string, size: number): Promise<string> => {
  const handle = await open(file, 'r')
  try {
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    return size > length ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

/** The newest custom title of a transcript tail, else the newest AI title. */
export const titleOf = (tail: string): string | null => {
  let ai: string | null = null
  const lines = tail.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] as string
    const custom = line.includes('"custom-title"')
    if (!custom && (ai !== null || !line.includes('"ai-title"'))) continue
    try {
      const entry = JSON.parse(line) as { type?: string; customTitle?: unknown; aiTitle?: unknown }
      if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
        if (entry.customTitle.trim()) return entry.customTitle.trim()
      } else if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string' && !ai) {
        ai = entry.aiTitle.trim() || null
      }
    } catch {}
  }
  return ai
}

const transcriptTitle = async (id: string, cwd: string): Promise<string | null> => {
  const file = await transcriptPath(id, cwd)
  if (!file) return null
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const cached = titles.get(id)
  if (cached && cached.mtimeMs === info.mtimeMs) return cached.title
  const title = titleOf(await readTail(file, info.size).catch(() => ''))
  titles.set(id, { mtimeMs: info.mtimeMs, title })
  return title
}

const branchOf = async (cwd: string, now: number): Promise<string | null> => {
  const cached = branches.get(cwd)
  if (cached && now - cached.at < BRANCH_TTL_MS) return cached.branch
  let branch: string | null = null
  try {
    const { stdout } = await run('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])
    branch = stdout.trim() || null
    if (branch === 'HEAD') {
      const short = await run('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'])
      branch = short.stdout.trim() || null
    }
  } catch {}
  branches.set(cwd, { at: now, branch })
  return branch
}

export const sessionInfo = async (
  session: Pick<Session, 'id' | 'label' | 'cwd'>,
  now = Date.now(),
): Promise<{ title: string; branch?: string }> => {
  const title = await transcriptTitle(session.id, session.cwd).catch(() => null)
  const branch = session.cwd ? await branchOf(session.cwd, now) : null
  return { title: title ?? session.label, ...(branch ? { branch } : {}) }
}

export const resetSessionInfoCache = (): void => {
  titles.clear()
  branches.clear()
  projectDirs = null
}
