import { readCanvasPages } from '../../../lib/canvas-pages'
import { bad, isText, readBody } from '../../../lib/comments-input'
import { createPageRequest, isSessionLive } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_SESSION = 'That Claude session is not running. Run /irsim in Claude Code, then try again.'

/** `{ sessionId, page, kind }` asks the session to tidy a page or to choose its icon. */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { sessionId, page, kind } = body
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (!isText(page)) return bad('page must be text')
  if (kind !== 'reorganize' && kind !== 'icon') return bad('kind must be reorganize or icon')
  if (!(await readCanvasPages()).some((one) => one.id === page)) return bad('unknown page')
  if (!(await isSessionLive(sessionId))) return Response.json({ error: NO_SESSION }, { status: 409 })
  const queued = await createPageRequest({ page, kind, sessionId })
  if (queued === 'no_session') return Response.json({ error: NO_SESSION }, { status: 409 })
  return Response.json({ id: queued.id })
}
