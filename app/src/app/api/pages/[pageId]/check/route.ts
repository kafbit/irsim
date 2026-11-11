import { readCanvasPages } from '../../../../../lib/canvas-pages'
import { runChecks, targetOf } from '../../../../../lib/check-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Checks every board of a page, like `/api/boards/<board>/check` for each. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<Response> {
  const { pageId } = await params
  const page = (await readCanvasPages()).find((candidate) => candidate.id === pageId)
  if (!page) return Response.json({ error: `no page named ${pageId}` }, { status: 404 })
  if (page.boards.length === 0) return Response.json([])
  return runChecks(
    request,
    page.boards.map((board) => targetOf(board.name, board)),
  )
}
