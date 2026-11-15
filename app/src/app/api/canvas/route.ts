import { applyEdit, type CanvasEdit, placeBoard } from '../../../lib/canvas-layout'
import { editCanvas, invalid, locked, readCanvas, writeCanvas } from '../../../lib/canvas-file'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export async function GET(): Promise<Response> {
  const canvas = await readCanvas()
  if (canvas === null) return Response.json({ error: 'canvas.json not found' }, { status: 404 })
  return Response.json(canvas)
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'body is not valid JSON' }, { status: 400 })
  }
  const problem = invalid(body)
  if (problem) return Response.json({ error: problem }, { status: 400 })
  await locked(() => writeCanvas(body))
  return Response.json({ ok: true })
}

const editOf = (body: Record<string, unknown>): CanvasEdit | string => {
  if (body.boards !== undefined) {
    if (!Array.isArray(body.boards) || !body.boards.every((item) => isRecord(item) && typeof item.name === 'string')) {
      return 'boards must be a list of objects with a string name'
    }
  }
  if (body.sections !== undefined && !isRecord(body.sections)) return 'sections must be an object'
  return { boards: body.boards, sections: body.sections } as CanvasEdit
}

/**
 * Applies one layout edit. The body is either `{ page, board, x, y, width, height }` (one board) or
 * `{ page, boards?, sections? }` (several boards and section edits). Runs under one lock so two
 * requests cannot lose each other's edit.
 */
export async function PATCH(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'body is not valid JSON' }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.page !== 'string') {
    return Response.json({ error: 'page must be a string' }, { status: 400 })
  }
  const { page } = body
  let apply: Parameters<typeof editCanvas>[0]
  if (typeof body.board === 'string') {
    const { board } = body
    const rect = { x: body.x, y: body.y, width: body.width, height: body.height }
    apply = (canvas) => placeBoard(canvas, page, board, rect)
  } else {
    const edit = editOf(body)
    if (typeof edit === 'string') return Response.json({ error: edit }, { status: 400 })
    apply = (canvas) => applyEdit(canvas, page, edit)
  }
  const failure = await editCanvas(apply)
  if (failure) return Response.json({ error: failure.error }, { status: failure.status })
  return Response.json({ ok: true })
}
