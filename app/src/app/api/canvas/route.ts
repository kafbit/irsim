import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  const file = join(designDir(), 'canvas.json')
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(body, null, 2)}\n`)
  await rename(temp, file)
  return Response.json({ ok: true })
}
