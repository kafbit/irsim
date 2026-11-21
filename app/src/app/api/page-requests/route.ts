import { readCanvasPages } from '../../../lib/canvas-pages'
import { bad, hasUnknownImage, isText, parseImages, readBody } from '../../../lib/comments-input'
import { createPageRequest } from '../../../lib/comments-store'
import type { AskScopeKind } from '../../../lib/comments-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PROMPT = 8000
const MAX_BOARDS = 50
const SCOPES = ['page', 'board', 'boards', 'section']

const NO_SESSION = 'That Claude session is not running. Run /irsim in Claude Code, then try again.'

/** `{ sessionId, page, kind }` asks the session to tidy a page or to choose its icon; kind ask carries a prompt and a scope. */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { sessionId, page, kind } = body
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (kind !== 'reorganize' && kind !== 'icon' && kind !== 'ask')
    return bad('kind must be reorganize, icon or ask')
  const noPage = kind === 'ask' && (page === undefined || page === '')
  if (!noPage && !isText(page)) return bad('page must be text')
  if (!noPage && !(await readCanvasPages()).some((one) => one.id === page)) return bad('unknown page')
  if (kind === 'ask') {
    const { prompt, scope, board, boards, section } = body
    if (!isText(prompt) || prompt.length > MAX_PROMPT)
      return bad(`prompt must be text of up to ${MAX_PROMPT} characters`)
    if (typeof scope !== 'string' || !SCOPES.includes(scope))
      return bad('scope must be page, board, boards or section')
    if (scope === 'board' && !isText(board)) return bad('board must be text')
    if (
      scope === 'boards' &&
      (!Array.isArray(boards) ||
        boards.length === 0 ||
        boards.length > MAX_BOARDS ||
        !boards.every(isText))
    )
      return bad(`boards must be up to ${MAX_BOARDS} texts`)
    if (scope === 'section' && !isText(section)) return bad('section must be text')
    const images = parseImages(body.images)
    if (typeof images === 'string') return bad(images)
    if (await hasUnknownImage(images)) return bad('unknown image')
    const queued = await createPageRequest({
      page: noPage ? '' : (page as string),
      kind,
      sessionId,
      prompt,
      scope: scope as AskScopeKind,
      ...(scope === 'board' ? { board: board as string } : {}),
      ...(scope === 'boards' ? { boards: boards as string[] } : {}),
      ...(scope === 'section' ? { section: section as string } : {}),
      ...(images.length > 0 ? { images } : {}),
    })
    if (queued === 'no_session') return Response.json({ error: NO_SESSION }, { status: 409 })
    return Response.json({ id: queued.id })
  }
  const queued = await createPageRequest({ page: page as string, kind, sessionId })
  if (queued === 'no_session') return Response.json({ error: NO_SESSION }, { status: 409 })
  return Response.json({ id: queued.id })
}
