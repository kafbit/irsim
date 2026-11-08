import type { NewComment } from './comments-store'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const bad = (message: string): Response => Response.json({ error: message }, { status: 400 })

export const readBody = async (request: Request): Promise<Record<string, unknown> | Response> => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('body is not valid JSON')
  }
  return isRecord(body) ? body : bad('body must be an object')
}

export const parseNewComment = (body: Record<string, unknown>): NewComment | string => {
  const { page, board, file, line, element, rect } = body
  if (!isText(page) || !isText(board) || !isText(file)) return 'page, board and file must be text'
  if (!isNumber(line)) return 'line must be a number'
  if (!isText(body.body)) return 'body must be text'
  if (
    !isRecord(element) ||
    typeof element.tag !== 'string' ||
    typeof element.path !== 'string' ||
    typeof element.text !== 'string'
  ) {
    return 'element must hold tag, path and text'
  }
  if (
    !isRecord(rect) ||
    !isNumber(rect.x) ||
    !isNumber(rect.y) ||
    !isNumber(rect.width) ||
    !isNumber(rect.height)
  ) {
    return 'rect must hold x, y, width and height'
  }
  return {
    page,
    board,
    file,
    line,
    element: { tag: element.tag, path: element.path, text: element.text },
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    body: body.body,
  }
}
