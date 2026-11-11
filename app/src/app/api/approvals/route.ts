import { boardExists } from '../../../lib/board-name'
import { readCanvasPages } from '../../../lib/canvas-pages'
import { bad, isText, readBody } from '../../../lib/comments-input'
import { createApproval, listApprovals } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_NOTE = 2000

const REFUSED = {
  stale: 'The board changed while you were looking at it. Look at it again, then approve.',
  no_session: 'That Claude session is not running. Run /canvas in Claude Code, then approve.',
} as const

/** The content hash of each board of `?page=` and the latest approval of each. */
export async function GET(request: Request): Promise<Response> {
  const pageId = new URL(request.url).searchParams.get('page')
  if (!isText(pageId)) return bad('page is required')
  const page = (await readCanvasPages()).find((candidate) => candidate.id === pageId)
  if (!page) return Response.json({ error: `no page named ${pageId}` }, { status: 404 })
  return Response.json(await listApprovals(page.boards.map((board) => board.name)))
}

/**
 * `{ page, board, sessionId, hash, note? }`: the user approves the version of a board with that
 * content hash, and that session gets the turn.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { page, board, sessionId, hash, note } = body
  if (!isText(page)) return bad('page must be text')
  if (!isText(board)) return bad('board must be text')
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (!isText(hash)) return bad('hash must be text')
  if (note !== undefined && typeof note !== 'string') return bad('note must be text')
  if ((note ?? '').length > MAX_NOTE) return bad(`note must be at most ${MAX_NOTE} characters`)
  if (!boardExists(board)) return Response.json({ error: `no board named ${board}` }, { status: 404 })
  const known = (await readCanvasPages()).some(
    (candidate) => candidate.id === page && candidate.boards.some((b) => b.name === board),
  )
  if (!known) return Response.json({ error: `board ${board} is not on page ${page}` }, { status: 404 })
  const result = await createApproval({ page, board, sessionId, hash, note: (note ?? '').trim() })
  if (typeof result === 'string') return Response.json({ error: REFUSED[result] }, { status: 409 })
  return Response.json(result, { status: 201 })
}
