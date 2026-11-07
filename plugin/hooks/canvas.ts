import { CanvasError, api, baseUrl, ensureServer, listenKey, openUrl, registerSession } from './api'
import type { Comment, Engine, Page, PageSummary } from './api'
import { syncPoll } from './poll'

let boardPages: Map<string, { page: string; name: string }> | null = null

async function findBoard(
  $: Engine,
  name: string,
  pages: PageSummary[],
): Promise<{ page: string; name: string } | undefined> {
  const wanted = name.toLowerCase()
  if (boardPages?.has(wanted)) return boardPages.get(wanted)
  const map = new Map<string, { page: string; name: string }>()
  for (const summary of pages) {
    const page = await api<Page>($, `/api/pages/${encodeURIComponent(summary.id)}`)
    for (const board of page.boards)
      map.set(board.name.toLowerCase(), { page: summary.id, name: board.name })
  }
  boardPages = map
  return map.get(wanted)
}

type Target = { page?: string; board?: string }

async function resolveTarget($: Engine, arg: string): Promise<Target> {
  const wanted = arg.trim()
  if (!wanted) return {}
  const pages = await api<PageSummary[]>($, '/api/pages')
  const page = pages.find((one) => one.id.toLowerCase() === wanted.toLowerCase())
  if (page) return { page: page.id }
  const board = await findBoard($, wanted, pages)
  if (board) return { page: board.page, board: board.name }
  const ids = pages.map((one) => one.id).join(', ')
  throw new CanvasError(`no page or board named "${wanted}", pages: ${ids}`)
}

export async function openCanvas($: Engine, target: Target | string): Promise<string> {
  await ensureServer($)
  const { page, board } = typeof target === 'string' ? await resolveTarget($, target) : target
  const sessionId = await $.session.id()
  await registerSession($, await $.session.cwd(), sessionId)
  await $.store.set(listenKey(sessionId), true)
  await syncPoll($)
  const query = [
    ...(page && board ? [`board=${encodeURIComponent(board)}`] : []),
    `session=${encodeURIComponent(sessionId)}`,
  ].join('&')
  const url = `${await baseUrl($)}${page ? `/p/${encodeURIComponent(page)}` : '/'}?${query}`
  await openUrl($, url)
  return `Canvas open at ${url}, listening for comments.`
}

export async function stopCanvas($: Engine): Promise<string> {
  const sessionId = await $.session.id()
  await $.store.delete(listenKey(sessionId))
  await syncPoll($)
  await api($, `/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(
    () => undefined,
  )
  return 'Canvas listening stopped for this session.'
}

export async function commentCounts($: Engine): Promise<string> {
  const comments = await api<Comment[]>($, '/api/comments')
  const pages = new Map<string, Record<string, number>>()
  for (const comment of comments) {
    if (comment.status === 'resolved') continue
    const counts = pages.get(comment.page) ?? { draft: 0, queued: 0, delivered: 0 }
    counts[comment.status] = (counts[comment.status] ?? 0) + 1
    pages.set(comment.page, counts)
  }
  if (pages.size === 0) return 'No open comments.'
  return [...pages]
    .map(
      ([page, counts]) =>
        `${page}: ${counts.draft} draft, ${counts.queued} queued, ${counts.delivered} delivered`,
    )
    .join('\n')
}
