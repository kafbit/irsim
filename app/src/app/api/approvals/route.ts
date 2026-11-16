import { boardExists } from '../../../lib/board-name'
import { readCanvasPages } from '../../../lib/canvas-pages'
import { bad, isText, readBody } from '../../../lib/comments-input'
import { baselineOf, statusOf } from '../../../lib/board-status'
import { createApproval, createApprovals, listApprovals } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_NOTE = 2000

const REFUSED = {
  stale: 'The board changed while you were looking at it. Look at it again, then approve.',
  no_session: 'That Claude session is not running. Run /irsim in your coding agent, then approve.',
} as const

/** The content hash of each board of `?page=` and the latest approval of each. */
export async function GET(request: Request): Promise<Response> {
  const pageId = new URL(request.url).searchParams.get('page')
  if (!isText(pageId)) return bad('page is required')
  const page = (await readCanvasPages()).find((candidate) => candidate.id === pageId)
  if (!page) return Response.json({ error: `no page named ${pageId}` }, { status: 404 })
  const result = await listApprovals(page.boards.map((board) => board.name))
  const baseline = await baselineOf(pageId, result.hashes)
  const approved = new Map(result.approvals.map((approval) => [approval.board, approval]))
  const status = Object.fromEntries(
    page.boards.map(({ name }) => {
      const approval = approved.get(name)
      const hash = result.hashes[name] ?? ''
      return [
        name,
        statusOf({
          hash,
          baseline: baseline[name],
          // `current` says the approval still matches; a stale one never equals the hash.
          approvalHash: approval ? (approval.current ? hash : '') : undefined,
        }),
      ]
    }),
  )
  return Response.json({ ...result, status })
}

/**
 * `{ page, board, sessionId, hash, note? }`: the user approves the version of a board with that
 * content hash, and that session gets the turn.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { page, board, boards, sessionId, hash, note } = body
  if (!isText(page)) return bad('page must be text')
  if (boards !== undefined) {
    if (!isText(sessionId)) return bad('sessionId must be text')
    if (note !== undefined && typeof note !== 'string') return bad('note must be text')
    if (!Array.isArray(boards) || boards.length === 0) return bad('boards must be a list')
    const entries: { board: string; hash: string }[] = []
    for (const item of boards as { board?: unknown; hash?: unknown }[]) {
      if (!isText(item?.board) || !isText(item.hash)) return bad('each board needs a board and a hash')
      entries.push({ board: item.board, hash: item.hash })
    }
    const pageEntry = (await readCanvasPages()).find((candidate) => candidate.id === page)
    if (!pageEntry) return Response.json({ error: `no page named ${page}` }, { status: 404 })
    for (const { board: name } of entries) {
      if (!pageEntry.boards.some((b) => b.name === name)) {
        return Response.json({ error: `board ${name} is not on page ${page}` }, { status: 404 })
      }
    }
    const made = await createApprovals({ page, boards: entries, sessionId, note: (note ?? '').trim() })
    if (typeof made === 'string') return Response.json({ error: REFUSED[made] }, { status: 409 })
    return Response.json(made, { status: 201 })
  }
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
