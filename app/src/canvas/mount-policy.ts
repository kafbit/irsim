import { intersects, type PlacedBoard, type Size, type View, visibleWorld } from './geometry'

export const LIVE_MIN_SCALE = 0.25
export const MAX_BOOTING = 2
export const MAX_LIVE = 16
export const BOOT_TIMEOUT_MS = 8000
const MOUNT_MARGIN = 200

export type Report = { state: 'ready' } | { state: 'error'; message: string }

export type Entry = {
  mounted: boolean
  booting: boolean
  seen: number
  bootedAt: number
  report?: Report
}

/** `tick` counts changes of the visible set; an entry is visible when `seen` equals `tick`. */
export type MountState = { tick: number; entries: Record<string, Entry> }

export const EMPTY_MOUNTS: MountState = { tick: 0, entries: {} }

export const isVisible = (state: MountState, name: string) =>
  state.entries[name]?.seen === state.tick

/** Names of the boards a live frame may boot for, nearest to the viewport centre first. Empty below `LIVE_MIN_SCALE`. */
export function visibleNames(boards: PlacedBoard[], view: View, size: Size): string[] {
  if (view.k < LIVE_MIN_SCALE || size.width === 0 || size.height === 0) return []
  const world = visibleWorld(view, size)
  const cx = world.x + world.width / 2
  const cy = world.y + world.height / 2
  const margin = MOUNT_MARGIN / view.k
  return boards
    .filter((board) => intersects(board, world, margin))
    .map((board) => ({
      name: board.name,
      distance: Math.hypot(board.x + board.width / 2 - cx, board.y + board.height / 2 - cy),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.name)
}

/**
 * Moves the state to the next step for the ordered `visible` names at time `now`: marks them seen,
 * expires boots older than `BOOT_TIMEOUT_MS`, starts waiting boards up to `MAX_BOOTING` frames
 * loading at once, then unmounts the least recently visible frames beyond `MAX_LIVE`. Returns the
 * same object when nothing changed.
 */
export function advance(state: MountState, visible: string[], now: number): MountState {
  const current = Object.keys(state.entries).filter((name) => isVisible(state, name))
  const same = current.length === visible.length && visible.every((name) => isVisible(state, name))
  const tick = same ? state.tick : state.tick + 1
  const entries: Record<string, Entry> = { ...state.entries }
  let changed = !same

  if (!same) {
    for (const name of visible) {
      const entry = entries[name]
      entries[name] = entry
        ? { ...entry, seen: tick }
        : { mounted: false, booting: false, seen: tick, bootedAt: 0 }
    }
  }

  let booting = 0
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.booting && now - entry.bootedAt >= BOOT_TIMEOUT_MS) {
      entries[name] = { ...entry, booting: false }
      changed = true
    } else if (entry.booting) booting += 1
  }

  for (const name of visible) {
    if (booting >= MAX_BOOTING) break
    const entry = entries[name]
    if (!entry || entry.mounted) continue
    entries[name] = { ...entry, mounted: true, booting: true, bootedAt: now }
    booting += 1
    changed = true
  }

  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.mounted && entry.seen !== tick) {
      delete entries[name]
      changed = true
    }
  }

  if (evict(entries, tick)) changed = true

  return changed ? { tick, entries } : state
}

/** Records the outcome a frame posted and frees its boot slot. Ignores a board that is not mounted. */
export function settle(state: MountState, name: string, report: Report): MountState {
  const entry = state.entries[name]
  if (!entry?.mounted) return state
  return { ...state, entries: { ...state.entries, [name]: { ...entry, booting: false, report } } }
}

function evict(entries: Record<string, Entry>, tick: number): boolean {
  const live = Object.entries(entries).filter(([, entry]) => entry.mounted)
  const evictable = live
    .filter(([, entry]) => entry.seen !== tick)
    .sort((a, b) => a[1].seen - b[1].seen)
    .slice(0, Math.max(0, live.length - MAX_LIVE))
  for (const [name] of evictable) delete entries[name]
  return evictable.length > 0
}
