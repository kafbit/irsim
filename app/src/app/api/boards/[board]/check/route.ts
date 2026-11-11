import { readCanvasPages } from '../../../../../lib/canvas-pages'
import { BOARD_NAME, runChecks, targetOf } from '../../../../../lib/check-route'
import { closureOf } from '../../../../../lib/closure'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Renders one board in headless Chromium: errors, an empty-render warning and a screenshot path. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const name = (await params).board.replace(/\.dc\.html$/, '')
  if (!BOARD_NAME.test(name)) return Response.json({ error: 'invalid board name' }, { status: 400 })
  const { boards } = await closureOf(name)
  if (boards[name] === undefined)
    return Response.json({ error: `no board named ${name}` }, { status: 404 })
  const placed = (await readCanvasPages())
    .flatMap((page) => page.boards)
    .find((board) => board.name === name)
  return runChecks(request, [targetOf(name, placed)])
}
