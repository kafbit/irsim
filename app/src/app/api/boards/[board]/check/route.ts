import { BOARD_NAME, boardExists, boardNameOf } from '../../../../../lib/board-name'
import { readCanvasPages } from '../../../../../lib/canvas-pages'
import { runChecks, targetOf } from '../../../../../lib/check-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Renders one board in headless Chromium: errors, an empty-render warning and a screenshot path. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const name = boardNameOf((await params).board)
  if (!BOARD_NAME.test(name)) return Response.json({ error: 'invalid board name' }, { status: 400 })
  if (!boardExists(name)) return Response.json({ error: `no board named ${name}` }, { status: 404 })
  const placed = (await readCanvasPages())
    .flatMap((page) => page.boards)
    .find((board) => board.name === name)
  return runChecks(request, [targetOf(name, placed)])
}
