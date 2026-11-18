import { readCanvasPages } from '../../../../../lib/canvas-pages'
import { iconWarning, runChecks, targetOf } from '../../../../../lib/check-route'

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
  const warning = iconWarning(page.icon)
  const extra = warning ? [{ board: page.id, ok: false, ms: 0, errors: [], warnings: [warning] }] : []
  if (page.boards.length === 0) return Response.json(extra)
  const response = await runChecks(
    request,
    page.boards.map((board) => targetOf(board.name, board)),
  )
  if (!response.ok || extra.length === 0) return response
  return Response.json([...((await response.json()) as unknown[]), ...extra])
}
