import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type CanvasFile, placeBoard } from '../../../lib/canvas-layout'
import { designDir } from '../../../lib/design-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringMap = (value: unknown): boolean =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value)

const isBoard = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.title === 'string' &&
  isNumber(value.x) &&
  isNumber(value.y) &&
  isNumber(value.width) &&
  isNumber(value.height)

const isPage = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  Array.isArray(value.boards) &&
  value.boards.every(isBoard)

const invalid = (body: unknown): string | null => {
  if (!isRecord(body)) return 'body must be an object'
  if (body.version !== 1) return 'version must be 1'
  if (!Array.isArray(body.pages) || !body.pages.every(isPage)) return 'pages is malformed'
  const overrides = body.overrides
  if (
    !isRecord(overrides) ||
    !isStringMap(overrides.colors) ||
    !isStringMap(overrides.radius) ||
    !isStringMap(overrides.type)
  ) {
    return 'overrides must hold colors, radius and type string maps'
  }
  if (!isStringMap(body.bindings)) return 'bindings must be a string map'
  return null
}

const writeCanvas = async (canvas: unknown): Promise<void> => {
  const file = join(designDir(), 'canvas.json')
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(canvas, null, 2)}\n`)
  await rename(temp, file)
}

let queue: Promise<unknown> = Promise.resolve()
const locked = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

export async function GET(): Promise<Response> {
  const file = join(designDir(), 'canvas.json')
  if (!existsSync(file)) return Response.json({ error: 'canvas.json not found' }, { status: 404 })
  return Response.json(JSON.parse(await readFile(file, 'utf8')))
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

/** Moves or resizes one board. Reads, edits and writes under one lock so two requests cannot lose each other's edit. */
export async function PATCH(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'body is not valid JSON' }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.page !== 'string' || typeof body.board !== 'string') {
    return Response.json({ error: 'page and board must be strings' }, { status: 400 })
  }
  const { page, board } = body
  const rect = { x: body.x, y: body.y, width: body.width, height: body.height }
  return locked(async () => {
    const file = join(designDir(), 'canvas.json')
    if (!existsSync(file)) return Response.json({ error: 'canvas.json not found' }, { status: 404 })
    const current: unknown = JSON.parse(await readFile(file, 'utf8'))
    const stored = invalid(current)
    if (stored)
      return Response.json({ error: `canvas.json is invalid: ${stored}` }, { status: 500 })
    const placement = placeBoard(current as CanvasFile, page, board, rect)
    if ('error' in placement) {
      return Response.json({ error: placement.error }, { status: placement.status })
    }
    const problem = invalid(placement.canvas)
    if (problem) return Response.json({ error: problem }, { status: 400 })
    await writeCanvas(placement.canvas)
    return Response.json({ ok: true })
  })
}
