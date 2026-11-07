import { describe, expect, it } from 'vitest'
import type { PlacedBoard } from '../src/canvas/geometry'
import {
  advance,
  BOOT_TIMEOUT_MS,
  EMPTY_MOUNTS,
  isVisible,
  MAX_BOOTING,
  MAX_LIVE,
  type MountState,
  settle,
  visibleNames,
} from '../src/canvas/mount-policy'

const board = (name: string, x: number, y = 0): PlacedBoard => ({
  name,
  title: name,
  hash: name,
  x,
  y,
  width: 100,
  height: 100,
})

const size = { width: 1000, height: 600 }
const mountedNames = (state: MountState) =>
  Object.entries(state.entries)
    .filter(([, entry]) => entry.mounted)
    .map(([name]) => name)
    .sort()

describe('visibleNames', () => {
  const boards = [board('far', 5000), board('near', 400), board('edge', 1100), board('mid', 450)]

  it('keeps the boards in the viewport and its margin, nearest to the centre first', () => {
    const view = { x: 0, y: 0, k: 1 }
    expect(visibleNames(boards, view, size)).toEqual(['mid', 'near', 'edge'])
  })

  it('is empty below the live scale', () => {
    expect(visibleNames(boards, { x: 0, y: 0, k: 0.2 }, size)).toEqual([])
  })

  it('is empty before the viewport is measured', () => {
    expect(visibleNames(boards, { x: 0, y: 0, k: 1 }, { width: 0, height: 0 })).toEqual([])
  })

  it('the margin is 200 screen pixels, so it grows in world units as k shrinks', () => {
    const view = { x: 0, y: 0, k: 0.25 }
    expect(visibleNames([board('a', 4000 + 700)], view, size)).toEqual(['a'])
    expect(visibleNames([board('b', 4000 + 900)], view, size)).toEqual([])
  })
})

describe('advance', () => {
  const names = ['a', 'b', 'c', 'd']

  it('boots at most MAX_BOOTING frames at once, in order', () => {
    const state = advance(EMPTY_MOUNTS, names, 0)
    expect(mountedNames(state)).toEqual(names.slice(0, MAX_BOOTING))
    expect(state.entries.c?.mounted).toBe(false)
  })

  it('starts the next frame when one settles', () => {
    let state = advance(EMPTY_MOUNTS, names, 0)
    state = settle(state, 'a', { state: 'ready' })
    state = advance(state, names, 10)
    expect(mountedNames(state)).toEqual(['a', 'b', 'c'])
    expect(state.entries.a?.report).toEqual({ state: 'ready' })
  })

  it('an error also frees the slot', () => {
    let state = advance(EMPTY_MOUNTS, names, 0)
    state = settle(state, 'b', { state: 'error', message: 'boom' })
    state = advance(state, names, 10)
    expect(state.entries.c?.mounted).toBe(true)
  })

  it('a boot that never settles is released after the timeout', () => {
    let state = advance(EMPTY_MOUNTS, names, 0)
    state = advance(state, names, BOOT_TIMEOUT_MS - 1)
    expect(state.entries.c?.mounted).toBe(false)
    state = advance(state, names, BOOT_TIMEOUT_MS)
    expect(state.entries.a?.booting).toBe(false)
    expect(mountedNames(state)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns the same object when nothing changed', () => {
    const state = advance(EMPTY_MOUNTS, names, 0)
    expect(advance(state, names, 1)).toBe(state)
  })

  it('a frame that leaves the viewport stays mounted and is marked hidden', () => {
    let state = advance(EMPTY_MOUNTS, ['a'], 0)
    state = settle(state, 'a', { state: 'ready' })
    state = advance(state, [], 5)
    expect(state.entries.a?.mounted).toBe(true)
    expect(isVisible(state, 'a')).toBe(false)
    state = advance(state, ['a'], 6)
    expect(isVisible(state, 'a')).toBe(true)
    expect(state.entries.a?.report).toEqual({ state: 'ready' })
  })

  it('drops waiting boards that left the viewport', () => {
    let state = advance(EMPTY_MOUNTS, names, 0)
    state = advance(state, ['a'], 1)
    expect(Object.keys(state.entries)).toEqual(['a', 'b'])
  })

  it('unmounts the least recently visible frames past MAX_LIVE', () => {
    const all = Array.from({ length: MAX_LIVE + 2 }, (_, index) => `f${index}`)
    let state = EMPTY_MOUNTS
    let now = 0
    for (const name of all) {
      state = advance(state, [name], (now += 1))
      state = settle(state, name, { state: 'ready' })
    }
    state = advance(state, [all.at(-1) as string], (now += 1))
    const live = mountedNames(state)
    expect(live).toHaveLength(MAX_LIVE)
    expect(live).not.toContain('f0')
    expect(live).not.toContain('f1')
    expect(live).toContain('f2')
    expect(live).toContain(all.at(-1) as string)
  })

  it('never unmounts a visible frame', () => {
    const all = Array.from({ length: MAX_LIVE + 3 }, (_, index) => `f${index}`)
    let state = EMPTY_MOUNTS
    let now = 0
    for (let round = 0; round < all.length; round += 1) {
      state = advance(state, all, (now += BOOT_TIMEOUT_MS))
    }
    expect(mountedNames(state)).toHaveLength(all.length)
  })
})

describe('settle', () => {
  it('ignores a board that is not mounted', () => {
    expect(settle(EMPTY_MOUNTS, 'x', { state: 'ready' })).toBe(EMPTY_MOUNTS)
  })
})
