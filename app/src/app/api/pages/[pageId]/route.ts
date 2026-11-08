import { readCanvasPages } from '../../../../lib/canvas-pages'
import { closureOf } from '../../../../lib/closure'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<Response> {
  const { pageId } = await params
  const page = (await readCanvasPages()).find((candidate) => candidate.id === pageId)
  if (!page) return Response.json({ error: `no page named ${pageId}` }, { status: 404 })
  const boards = await Promise.all(
    page.boards.map(async ({ name, title, x, y, width, height }) => {
      const { boards, hash } = await closureOf(name)
      return { name, title, x, y, width, height, hash, closure: Object.keys(boards) }
    }),
  )
  return Response.json({ id: page.id, title: page.title, boards })
}
