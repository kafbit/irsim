import { IMAGE_ID, imagePath } from './comment-images'
import type { NewComment } from './comments-store'
import type { CommentView } from './comments-types'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isLine = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0

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

export const MAX_IMAGES = 4

export const parseImages = (value: unknown): string[] | string => {
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.length > MAX_IMAGES ||
    !value.every((id) => typeof id === 'string' && IMAGE_ID.test(id))
  ) {
    return `images must be up to ${MAX_IMAGES} image ids`
  }
  return [...new Set(value as string[])]
}

export const hasUnknownImage = async (ids: string[]): Promise<boolean> =>
  (await Promise.all(ids.map(imagePath))).some((path) => path === null)

const MAX_PRESET = 32

const parseView = (value: unknown): CommentView | string | undefined => {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    !isNumber(value.width) ||
    !isNumber(value.height) ||
    !isNumber(value.scrollX) ||
    !isNumber(value.scrollY) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.scrollY < 0 ||
    typeof value.preset !== 'string' ||
    value.preset === '' ||
    value.preset.length > MAX_PRESET
  ) {
    return 'view must hold width, height, preset, scrollX and scrollY'
  }
  return {
    width: Math.round(value.width),
    height: Math.round(value.height),
    preset: value.preset,
    scrollX: Math.round(value.scrollX),
    scrollY: Math.round(value.scrollY),
  }
}

export const parseNewComment = (body: Record<string, unknown>): NewComment | string => {
  const { page, board, file, line, element, rect } = body
  if (!isText(page) || !isText(board) || !isText(file)) return 'page, board and file must be text'
  if (!isLine(line)) return 'line must be an integer of 0 or more'
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
  const images = parseImages(body.images)
  if (typeof images === 'string') return images
  const view = parseView(body.view)
  if (typeof view === 'string') return view
  return {
    page,
    board,
    file,
    line,
    element: { tag: element.tag, path: element.path, text: element.text },
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    body: body.body,
    images,
    ...(view ? { view } : {}),
  }
}
