import { readCanvasPages } from '../../../../lib/canvas-pages'
import { closureOf } from '../../../../lib/closure'
import { isInteractive } from '../../../../lib/interactive'
import { fillsWindow } from '../../../../lib/page-fill'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<Response> {
  const { pageId } = await params
  const page = (await readCanvasPages()).find((candidate) => candidate.id === pageId)
  if (!page) return Response.json({ error: `no page named ${pageId}` }, { status: 404 })
  const sections = page.sections ?? []
  const sectionIds = new Set(sections.map((entry) => entry.id))
  const boards = await Promise.all(
    page.boards.map(async ({
      name,
      title,
      x,
      y,
      width,
      height,
      interactive,
      expand,
      section,
      variantOf,
      variantLabel,
      baseHash,
    }) => {
      const { boards, render } = await closureOf(name)
      return {
        name,
        title,
        x,
        y,
        width,
        height,
        hash: render,
        closure: Object.keys(boards),
        interactive: isInteractive(interactive, boards[name]),
        fill: fillsWindow(expand, boards[name], width),
        ...(section !== undefined && sectionIds.has(section) ? { section } : {}),
        ...(variantOf !== undefined ? { variantOf, unchanged: render === baseHash } : {}),
        ...(variantLabel !== undefined ? { variantLabel } : {}),
        ...(baseHash !== undefined ? { baseHash } : {}),
      }
    }),
  )
  return Response.json({ id: page.id, title: page.title, sections, boards })
}
