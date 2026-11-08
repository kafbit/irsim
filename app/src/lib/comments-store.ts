import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Comment, Session } from './comments-types'
import { emit } from './events'
import { buildTurnText } from './turn-text'

export type NewComment = Pick<
  Comment,
  'page' | 'board' | 'file' | 'line' | 'element' | 'rect' | 'body'
>

export type CommentFilter = {
  status?: string | undefined
  page?: string | undefined
  board?: string | undefined
  session?: string | undefined
}

export type Claim = { batch: string | null; count: number; text: string; comments: Comment[] }

export const SESSION_TTL_MS = 30_000

type Queue = { tail: Promise<unknown> }

const holder = globalThis as typeof globalThis & { __canvasWriteQueue?: Queue }
const queue = (holder.__canvasWriteQueue ??= { tail: Promise.resolve() })

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.tail.then(task)
  queue.tail = run.catch(() => undefined)
  return run
}

export const dataDir = (): string => {
  const override = process.env.CANVAS_DATA_DIR
  if (override) return override
  const cwd = process.cwd()
  const root = existsSync(join(cwd, 'apps/design')) ? join(cwd, 'apps/design') : cwd
  return join(root, '.data')
}

const readList = async <T>(name: string): Promise<T[]> => {
  try {
    return JSON.parse(await readFile(join(dataDir(), name), 'utf8')) as T[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

const writeList = async (name: string, list: unknown[]): Promise<void> => {
  const dir = dataDir()
  await mkdir(dir, { recursive: true })
  const file = join(dir, name)
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(list, null, 2)}\n`)
  await rename(temp, file)
}

const newId = (prefix: 'c' | 'b'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`

const touched = (ids: string[]): void => emit({ event: 'comments', data: { ids } })

export const listSessions = async (now = Date.now()): Promise<Session[]> => {
  const sessions = await readList<Session>('sessions.json')
  return sessions
    .filter((session) => now - Date.parse(session.lastSeen) < SESSION_TTL_MS)
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
}

const upsert = (sessions: Session[], next: Omit<Session, 'lastSeen'>, now: number): Session[] => {
  const entry = { ...next, lastSeen: new Date(now).toISOString() }
  return [...sessions.filter((session) => session.id !== next.id), entry]
}

export const upsertSession = (
  input: Omit<Session, 'lastSeen'>,
  now = Date.now(),
): Promise<Session> =>
  enqueue(async () => {
    const sessions = upsert(await readList<Session>('sessions.json'), input, now)
    await writeList('sessions.json', sessions)
    return sessions[sessions.length - 1] as Session
  })

export const removeSession = (id: string): Promise<boolean> =>
  enqueue(async () => {
    const sessions = await readList<Session>('sessions.json')
    const rest = sessions.filter((session) => session.id !== id)
    if (rest.length === sessions.length) return false
    await writeList('sessions.json', rest)
    return true
  })

export const listComments = async (filter: CommentFilter = {}): Promise<Comment[]> => {
  const all = await readList<Comment>('comments.json')
  return all
    .filter(
      (comment) =>
        (!filter.status || comment.status === filter.status) &&
        (!filter.page || comment.page === filter.page) &&
        (!filter.board || comment.board === filter.board) &&
        (!filter.session || comment.sessionId === filter.session),
    )
    .reverse()
}

export const createComment = (input: NewComment, now = Date.now()): Promise<Comment> =>
  enqueue(async () => {
    const all = await readList<Comment>('comments.json')
    const comment: Comment = {
      id: newId('c'),
      ...input,
      status: 'draft',
      sessionId: null,
      batch: null,
      replies: [],
      createdAt: new Date(now).toISOString(),
    }
    await writeList('comments.json', [...all, comment])
    touched([comment.id])
    return comment
  })

export type Change<T> = { ok: true; value: T } | { ok: false; reason: 'not_found' | 'not_draft' }

const mutateOne = (
  id: string,
  change: (comment: Comment) => Comment | 'not_draft',
): Promise<Change<Comment>> =>
  enqueue(async () => {
    const all = await readList<Comment>('comments.json')
    const index = all.findIndex((comment) => comment.id === id)
    const current = all[index]
    if (!current) return { ok: false, reason: 'not_found' }
    const next = change(current)
    if (next === 'not_draft') return { ok: false, reason: 'not_draft' }
    all[index] = next
    await writeList('comments.json', all)
    touched([id])
    return { ok: true, value: next }
  })

export const updateComment = (
  id: string,
  patch: { body?: string | undefined; status?: 'resolved' | undefined },
): Promise<Change<Comment>> =>
  mutateOne(id, (comment) => {
    if (patch.body !== undefined && comment.status !== 'draft') return 'not_draft'
    return {
      ...comment,
      body: patch.body ?? comment.body,
      status: patch.status ?? comment.status,
    }
  })

export const addReply = (
  id: string,
  reply: { author: 'claude' | 'user'; body: string },
  now = Date.now(),
): Promise<Change<Comment>> =>
  mutateOne(id, (comment) => ({
    ...comment,
    replies: [...comment.replies, { ...reply, at: new Date(now).toISOString() }],
  }))

export const deleteComment = (id: string): Promise<Change<string>> =>
  enqueue(async () => {
    const all = await readList<Comment>('comments.json')
    const current = all.find((comment) => comment.id === id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (current.status !== 'draft') return { ok: false, reason: 'not_draft' }
    await writeList(
      'comments.json',
      all.filter((comment) => comment.id !== id),
    )
    touched([id])
    return { ok: true, value: id }
  })

export const sendDrafts = (input: {
  sessionId: string
  page?: string | undefined
}): Promise<{ batch: string | null; count: number }> =>
  enqueue(async () => {
    const all = await readList<Comment>('comments.json')
    const ids: string[] = []
    const batch = newId('b')
    const next = all.map((comment): Comment => {
      if (comment.status !== 'draft' || (input.page && comment.page !== input.page)) return comment
      ids.push(comment.id)
      return { ...comment, status: 'queued', sessionId: input.sessionId, batch }
    })
    if (ids.length === 0) return { batch: null, count: 0 }
    await writeList('comments.json', next)
    touched(ids)
    return { batch, count: ids.length }
  })

export const claim = (sessionId: string, now = Date.now()): Promise<Claim> =>
  enqueue(async () => {
    const sessions = await readList<Session>('sessions.json')
    const known = sessions.find((session) => session.id === sessionId)
    const identity = known ?? { id: sessionId, label: sessionId, cwd: '' }
    await writeList('sessions.json', upsert(sessions, identity, now))
    const all = await readList<Comment>('comments.json')
    const taken = all.filter(
      (comment) => comment.status === 'queued' && comment.sessionId === sessionId,
    )
    if (taken.length === 0) return { batch: null, count: 0, text: '', comments: [] }
    const ids = new Set(taken.map((comment) => comment.id))
    const next = all.map((comment): Comment =>
      ids.has(comment.id) ? { ...comment, status: 'delivered' } : comment,
    )
    await writeList('comments.json', next)
    touched([...ids])
    const delivered = next.filter((comment) => ids.has(comment.id))
    return {
      batch: delivered[delivered.length - 1]?.batch ?? null,
      count: delivered.length,
      text: buildTurnText(delivered),
      comments: delivered,
    }
  })
