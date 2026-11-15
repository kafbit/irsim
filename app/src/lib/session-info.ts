import { execFile } from 'node:child_process'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Session } from './comments-types'
import { agentOf } from './agents'

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

export const commandCodeDir = (): string =>
  process.env.COMMANDCODE_HOME || join(homedir(), '.commandcode')

export const codexDir = (): string => process.env.CODEX_HOME || join(homedir(), '.codex')

type FileTitle = { mtimeMs: number; title: string | null }
const fileTitles = new Map<string, FileTitle>()

/** Runs `read` on `file`'s text again only when its mtime changed. */
const cachedFile = async (
  key: string,
  file: string,
  read: (text: string) => string | null,
): Promise<string | null> => {
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const cached = fileTitles.get(key)
  if (cached && cached.mtimeMs === info.mtimeMs) return cached.title
  const title = read(await readFile(file, 'utf8').catch(() => ''))
  fileTitles.set(key, { mtimeMs: info.mtimeMs, title })
  return title
}

/** `title` of a Command Code `<id>.meta.json`. */
export const commandCodeTitleOf = (text: string): string | null => {
  try {
    const meta = JSON.parse(text) as { title?: unknown }
    return typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : null
  } catch {
    return null
  }
}

/** The newest `thread_name` for `id` in Codex's `session_index.jsonl`; a later line wins. */
export const codexTitleOf = (text: string, id: string): string | null => {
  let title: string | null = null
  for (const line of text.split('\n')) {
    if (!line.includes(id)) continue
    try {
      const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown }
      if (entry.id === id && typeof entry.thread_name === 'string' && entry.thread_name.trim()) {
        title = entry.thread_name.trim()
      }
    } catch {}
  }
  return title
}

let commandCodeDirs: string[] | null = null
let commandCodeRoot = ''

const commandCodeTitle = async (id: string, cwd: string): Promise<string | null> => {
  const root = join(commandCodeDir(), 'projects')
  const direct = join(root, projectSlug(cwd), `${id}.meta.json`)
  let file: string | null = (await stat(direct).then(() => true, () => false)) ? direct : null
  if (!file) {
    if (commandCodeDirs === null || commandCodeRoot !== root) {
      commandCodeDirs = await readdir(root).catch(() => [])
      commandCodeRoot = root
    }
    for (const dir of commandCodeDirs) {
      const candidate = join(root, dir, `${id}.meta.json`)
      if (await stat(candidate).then(() => true, () => false)) {
        file = candidate
        break
      }
    }
  }
  return file ? cachedFile(`cc:${id}`, file, commandCodeTitleOf) : null
}

const codexTitle = (id: string): Promise<string | null> =>
  cachedFile(`codex:${id}`, join(codexDir(), 'session_index.jsonl'), (text) =>
    codexTitleOf(text, id),
  )

/** The agent's own name for the session, read from its session store. OpenCode and Pi keep the label. */
const agentTitle = (session: Pick<Session, 'id' | 'cwd'> & { agent?: Session['agent'] | undefined }): Promise<string | null> => {
  switch (agentOf(session.agent)) {
    case 'claude-code':
      return transcriptTitle(session.id, session.cwd)
    case 'command-code':
      return commandCodeTitle(session.id, session.cwd)
    case 'codex':
      return codexTitle(session.id)
    default:
      return Promise.resolve(null)
  }
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
  session: Pick<Session, 'id' | 'label' | 'cwd'> & { agent?: Session['agent'] | undefined },
  now = Date.now(),
): Promise<{ title: string; branch?: string }> => {
  const title = await agentTitle(session).catch(() => null)
  const branch = session.cwd ? await branchOf(session.cwd, now) : null
  return { title: title ?? session.label, ...(branch ? { branch } : {}) }
}

export const resetSessionInfoCache = (): void => {
  titles.clear()
  fileTitles.clear()
  branches.clear()
  projectDirs = null
  commandCodeDirs = null
}
