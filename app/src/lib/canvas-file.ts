import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CanvasFile } from './canvas-layout'
import { designDir } from './design-dir'
import { emit } from './events'

export type EditFailure = { error: string; status: 400 | 404 | 500 }
export type EditResult = { canvas: CanvasFile } | EditFailure

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringMap = (value: unknown): boolean =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value)

const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === 'string'

const isBoard = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.title === 'string' &&
  isNumber(value.x) &&
  isNumber(value.y) &&
  isNumber(value.width) &&
  isNumber(value.height) &&
  isOptionalString(value.section) &&
  isOptionalString(value.variantOf) &&
  isOptionalString(value.variantLabel) &&
  isOptionalString(value.baseHash)

const isSection = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  isOptionalString(value.variantOf)

const hasSections = (value: Record<string, unknown>): boolean => {
  if (value.sections === undefined) return true
  if (!Array.isArray(value.sections) || !value.sections.every(isSection)) return false
  const ids = (value.sections as { id: string }[]).map((entry) => entry.id)
  return new Set(ids).size === ids.length
}

const isPage = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  hasSections(value) &&
  Array.isArray(value.boards) &&
  value.boards.every(isBoard)

export const invalid = (body: unknown): string | null => {
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

const canvasFile = (): string => join(designDir(), 'canvas.json')

/** The parsed `canvas.json`, or `null` when the file does not exist yet. */
export const readCanvas = async (): Promise<unknown | null> => {
  const file = canvasFile()
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8'))
}

export const writeCanvas = async (canvas: unknown): Promise<void> => {
  const file = canvasFile()
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(canvas, null, 2)}\n`)
  await rename(temp, file)
  emit({ event: 'canvas', data: {} })
}

type Lock = { queue: Promise<unknown> }

/** One lock per server process, kept on globalThis so every route module shares it in dev. */
const lock = (): Lock => {
  const holder = globalThis as unknown as { __irsimCanvasLock?: Lock }
  holder.__irsimCanvasLock ??= { queue: Promise.resolve() }
  return holder.__irsimCanvasLock
}

export const locked = <T>(task: () => Promise<T>): Promise<T> => {
  const state = lock()
  const run = state.queue.then(task, task)
  state.queue = run.catch(() => undefined)
  return run
}

/** Reads, edits, validates and writes `canvas.json` under the lock, so two writers cannot lose each other's edit. */
export const editCanvas = (apply: (canvas: CanvasFile) => EditResult): Promise<EditFailure | null> =>
  locked(async () => {
    const current = await readCanvas()
    if (current === null) return { error: 'canvas.json not found', status: 404 }
    const stored = invalid(current)
    if (stored) return { error: `canvas.json is invalid: ${stored}`, status: 500 }
    const result = apply(current as CanvasFile)
    if ('error' in result) return result
    const problem = invalid(result.canvas)
    if (problem) return { error: problem, status: 400 }
    await writeCanvas(result.canvas)
    return null
  })
