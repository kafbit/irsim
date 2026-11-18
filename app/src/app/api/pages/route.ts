import { readCanvasPages } from '../../../lib/canvas-pages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const pages = await readCanvasPages()
  return Response.json(
    pages.map((page) => ({
      id: page.id,
      title: page.title,
      ...(page.icon ? { icon: page.icon } : {}),
      boardCount: page.boards.length,
      boards: page.boards.slice(0, 6).map((board) => board.name),
    })),
  )
}
