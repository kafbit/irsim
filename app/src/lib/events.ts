import { type FSWatcher, watch } from 'node:fs'
import { designDir } from './design-dir'

export type CanvasEvent =
  | { event: 'board'; data: { board: string } }
  | { event: 'comments'; data: { ids: string[] } }
  | { event: 'approvals'; data: { ids: string[] } }
  | { event: 'thumb'; data: { board: string; ok: boolean } }
  | { event: 'canvas'; data: Record<string, never> }
  | { event: 'shared'; data: Record<string, never> }

type Listener = (event: CanvasEvent) => void

type State = {
  listeners: Set<Listener>
  timers: Map<string, ReturnType<typeof setTimeout>>
  watcher: FSWatcher | null
}

const DEBOUNCE_MS = 100
const CANVAS_FILE = 'canvas.json'
const BOARD_FILE = /^([A-Za-z][A-Za-z0-9]*)\.dc\.html$/

const holder = globalThis as typeof globalThis & { __canvasEvents?: State }
const state = (holder.__canvasEvents ??= { listeners: new Set(), timers: new Map(), watcher: null })

export const emit = (event: CanvasEvent): void => {
  for (const listener of state.listeners) listener(event)
}

const debounced = (file: string, send: () => void): void => {
  clearTimeout(state.timers.get(file))
  state.timers.set(
    file,
    setTimeout(() => {
      state.timers.delete(file)
      send()
    }, DEBOUNCE_MS),
  )
}

const SHARED_PREFIX = 'shared/'

const onFile = (raw: string): void => {
  const file = raw.replace(/\\/g, '/')
  if (file.startsWith(SHARED_PREFIX)) {
    return debounced(SHARED_PREFIX, () => emit({ event: 'shared', data: {} }))
  }
  if (file === CANVAS_FILE) return debounced(file, () => emit({ event: 'canvas', data: {} }))
  const board = BOARD_FILE.exec(file)?.[1]
  if (!board) return
  debounced(file, () => emit({ event: 'board', data: { board } }))
}

const ensureWatcher = (): void => {
  if (state.watcher) return
  try {
    state.watcher = watch(designDir(), { recursive: true }, (_, file) => file && onFile(file))
    state.watcher.on('error', () => {
      state.watcher?.close()
      state.watcher = null
    })
  } catch {
    state.watcher = null
  }
}

export const subscribe = (listener: Listener): (() => void) => {
  ensureWatcher()
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}
