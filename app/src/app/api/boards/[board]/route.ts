import { readCanvasPages } from '../../../../lib/canvas-pages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Where a board lives: `{ page, name }`. A link in a played board uses it to reach another page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const name = (await params).board.replace(/\.dc\.html$/, '').replace(/\.html$/, '')
  const page = (await readCanvasPages()).find((candidate) =>
    candidate.boards.some((board) => board.name === name),
  )
  if (!page) return Response.json({ error: `no board named ${name}` }, { status: 404 })
  return Response.json({ page: page.id, name })
}
