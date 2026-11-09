import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { imagePath, removeImages } from './comment-images'
import type { Comment, Reply, Session } from './comments-types'
import { dataDir } from './data-dir'
import { emit } from './events'
import { buildTurnText, unseenUserReplies } from './turn-text'

export type NewComment = Pick<
  Comment,
  'page' | 'board' | 'file' | 'line' | 'element' | 'rect' | 'body'
> & { images?: string[] | undefined }

export type CommentFilter = {
  status?: string | undefined
  page?: string | undefined
  board?: string | undefined
  session?: string | undefined
}

export type ClaimedComment = Comment & {
  imagePaths: string[]
  followUp: boolean
  newReplies: Reply[]
}

export type Claim = {
  batch: string | null
  count: number
  text: string
  comments: ClaimedComment[]
}

export const SESSION_TTL_MS = 30_000

type Queue = { tail: Promise<unknown> }

const holder = globalThis as typeof globalThis & { __canvasWriteQueue?: Queue }
const queue = (holder.__canvasWriteQueue ??= { tail: Promise.resolve() })

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.tail.then(task)
  queue.tail = run.catch(() => undefined)
  return run
}

const readList = async <T>(name: string): Promise<T[]> => {
  try {
    return JSON.parse(await readFile(join(dataDir(), name), 'utf8')) as T[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

const readComments = async (): Promise<Comment[]> =>
  (await readList<Comment>('comments.json')).map((comment) => ({
    ...comment,
    images: comment.images ?? [],
    replies: comment.replies.map((reply) => ({ ...reply, seen: reply.seen ?? true })),
  }))

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
  const all = await readComments()
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
    const all = await readComments()
    const comment: Comment = {
      id: newId('c'),
      ...input,
      images: input.images ?? [],
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

export type Refusal = 'not_draft' | 'is_draft' | 'no_session'

export type Change<T> = { ok: true; value: T } | { ok: false; reason: 'not_found' | Refusal }

const mutateOne = (
  id: string,
  change: (comment: Comment) => Comment | Refusal,
): Promise<Change<Comment>> =>
  enqueue(async () => {
    const all = await readComments()
    const index = all.findIndex((comment) => comment.id === id)
    const current = all[index]
    if (!current) return { ok: false, reason: 'not_found' }
    const next = change(current)
    if (typeof next === 'string') return { ok: false, reason: next }
    all[index] = next
    await writeList('comments.json', all)
    touched([id])
    return { ok: true, value: next }
  })

export const updateComment = async (
  id: string,
  patch: {
    body?: string | undefined
    images?: string[] | undefined
    status?: 'resolved' | undefined
  },
): Promise<Change<Comment>> => {
  let dropped: string[] = []
  const result = await mutateOne(id, (comment) => {
    const editing = patch.body !== undefined || patch.images !== undefined
    if (editing && comment.status !== 'draft') return 'not_draft'
    const images = patch.images ?? comment.images
    dropped = comment.images.filter((image) => !images.includes(image))
    return {
      ...comment,
      body: patch.body ?? comment.body,
      images,
      status: patch.status ?? comment.status,
    }
  })
  if (result.ok) await removeImages(dropped)
  return result
}

export const addReply = (
  id: string,
  reply: { author: 'claude' | 'user'; body: string },
  now = Date.now(),
): Promise<Change<Comment>> =>
  mutateOne(id, (comment) => {
    const at = new Date(now).toISOString()
    if (reply.author === 'claude') {
      return { ...comment, replies: [...comment.replies, { ...reply, at, seen: true }] }
    }
    if (comment.status === 'draft') return 'is_draft'
    if (!comment.sessionId) return 'no_session'
    return {
      ...comment,
      status: 'queued',
      reopened: comment.status === 'resolved' || comment.reopened === true,
      replies: [...comment.replies, { ...reply, at, seen: false }],
    }
  })

export const deleteComment = (id: string): Promise<Change<string>> =>
  enqueue(async () => {
    const all = await readComments()
    const current = all.find((comment) => comment.id === id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (current.status !== 'draft') return { ok: false, reason: 'not_draft' }
    await writeList(
      'comments.json',
      all.filter((comment) => comment.id !== id),
    )
    await removeImages(current.images)
    touched([id])
    return { ok: true, value: id }
  })

export const sendDrafts = (input: {
  sessionId: string
  page?: string | undefined
}): Promise<{ batch: string | null; count: number }> =>
  enqueue(async () => {
    const all = await readComments()
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
    const all = await readComments()
    const taken = all.filter(
      (comment) => comment.status === 'queued' && comment.sessionId === sessionId,
    )
    if (taken.length === 0) return { batch: null, count: 0, text: '', comments: [] }
    const ids = new Set(taken.map((comment) => comment.id))
    const before = new Map(taken.map((comment) => [comment.id, comment]))
    const next = all.map((comment): Comment =>
      ids.has(comment.id)
        ? {
            ...comment,
            status: 'delivered',
            reopened: false,
            replies: comment.replies.map((reply) => ({ ...reply, seen: true })),
          }
        : comment,
    )
    await writeList('comments.json', next)
    touched([...ids])
    const paths: Record<string, string> = {}
    for (const image of next.flatMap((comment) => (ids.has(comment.id) ? comment.images : []))) {
      const path = await imagePath(image)
      if (path) paths[image] = path
    }
    const delivered = next
      .filter((comment) => ids.has(comment.id))
      .map((comment): ClaimedComment => {
        const newReplies = unseenUserReplies(before.get(comment.id) as Comment)
        return {
          ...comment,
          imagePaths: comment.images.flatMap((image) => paths[image] ?? []),
          followUp: newReplies.length > 0,
          newReplies,
        }
      })
    return {
      batch: delivered[delivered.length - 1]?.batch ?? null,
      count: delivered.length,
      text: buildTurnText(taken, paths),
      comments: delivered,
    }
  })
