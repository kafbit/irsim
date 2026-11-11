import { boardExists } from '../../../lib/board-name'
import { readCanvasPages } from '../../../lib/canvas-pages'
import { bad, isText, readBody } from '../../../lib/comments-input'
import { createApproval, listApprovals } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_NOTE = 2000

/** The latest approval of each board of `?page=`, with `current: false` once the board changed. */
export async function GET(request: Request): Promise<Response> {
  const page = new URL(request.url).searchParams.get('page')
  if (!isText(page)) return bad('page is required')
  return Response.json(await listApprovals(page))
}

/** `{ page, board, sessionId, note? }`: the user approves a board, and that session gets the turn. */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { page, board, sessionId, note } = body
  if (!isText(page)) return bad('page must be text')
  if (!isText(board)) return bad('board must be text')
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (note !== undefined && typeof note !== 'string') return bad('note must be text')
  if ((note ?? '').length > MAX_NOTE) return bad(`note must be at most ${MAX_NOTE} characters`)
  if (!boardExists(board)) return Response.json({ error: `no board named ${board}` }, { status: 404 })
  const known = (await readCanvasPages()).some(
    (candidate) => candidate.id === page && candidate.boards.some((b) => b.name === board),
  )
  if (!known) return Response.json({ error: `board ${board} is not on page ${page}` }, { status: 404 })
  const approval = await createApproval({ page, board, sessionId, note: (note ?? '').trim() })
  return Response.json(approval, { status: 201 })
}
