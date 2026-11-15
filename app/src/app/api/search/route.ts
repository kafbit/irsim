import { readCanvasPages } from '../../../lib/canvas-pages'
import { closureOf, importsOf } from '../../../lib/closure'
import { isInteractive } from '../../../lib/interactive'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Section = { id: string; title: string }

export async function GET(): Promise<Response> {
  const pages = await readCanvasPages()
  const entries = pages.flatMap((page) => {
    const sections = (page as { sections?: Section[] }).sections ?? []
    return page.boards.map((board) => ({ page, board, sections }))
  })
  const sources = await Promise.all(
    entries.map(async ({ board }) => (await closureOf(board.name)).boards[board.name]),
  )
  const importers = new Map<string, Set<string>>()
  entries.forEach(({ board }, index) => {
    const source = sources[index]
    if (source === undefined) return
    for (const imported of importsOf(source)) {
      if (imported === board.name) continue
      const set = importers.get(imported) ?? new Set<string>()
      set.add(board.name)
      importers.set(imported, set)
    }
  })
  const boards = entries.map(({ page, board, sections }, index) => {
    const sectionId = (board as { section?: string }).section
    const section = sectionId ? sections.find((candidate) => candidate.id === sectionId) : undefined
    return {
      name: board.name,
      title: board.title,
      page: page.id,
      pageTitle: page.title,
      ...(section ? { section: section.id, sectionTitle: section.title } : {}),
      width: board.width,
      height: board.height,
      usedBy: importers.get(board.name)?.size ?? 0,
      interactive: isInteractive(board.interactive, sources[index]),
    }
  })
  const sections = pages.flatMap((page) => {
    const list = (page as { sections?: Section[] }).sections ?? []
    return list.map((section) => ({
      id: section.id,
      title: section.title,
      page: page.id,
      pageTitle: page.title,
      boards: page.boards.filter((board) => (board as { section?: string }).section === section.id).length,
    }))
  })
  const summaries = pages.map((page) => ({ id: page.id, title: page.title, boardCount: page.boards.length }))
  return Response.json({ boards, sections, pages: summaries })
}
