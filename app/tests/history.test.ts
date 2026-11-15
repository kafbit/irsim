import { describe, expect, it } from 'vitest'
import type { CanvasEdit } from '../src/lib/canvas-layout'
import {
  type Apply,
  type ApplyResult,
  createHistory,
  MERGE_WINDOW_MS,
  noticeFor,
} from '../src/canvas/history'

const at = (name: string, x: number): CanvasEdit => ({ boards: [{ name, x }] })

function setup(answer: (edit: CanvasEdit) => ApplyResult = () => ({ ok: true })) {
  const applied: CanvasEdit[] = []
  const apply: Apply = async (edit) => {
    applied.push(edit)
    return answer(edit)
  }
  let clock = 0
  const history = createHistory(apply, () => clock)
  return { history, applied, tick: (ms: number) => (clock += ms) }
}

describe('createHistory', () => {
  it('undo applies before and redo applies after', async () => {
    const { history, applied } = setup()
    history.record('move of A', at('A', 0), at('A', 100))
    expect(await history.undo()).toEqual({ kind: 'done', direction: 'undo', label: 'move of A' })
    expect(await history.redo()).toEqual({ kind: 'done', direction: 'redo', label: 'move of A' })
    expect(applied).toEqual([at('A', 0), at('A', 100)])
    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)
  })

  it('undoes entries newest first', async () => {
    const { history, applied } = setup()
    history.record('one', at('A', 0), at('A', 1))
    history.record('two', at('A', 1), at('A', 2))
    await history.undo()
    await history.undo()
    expect(applied).toEqual([at('A', 1), at('A', 0)])
    expect(await history.undo()).toEqual({ kind: 'empty', direction: 'undo' })
  })

  it('a new record clears the redo stack', async () => {
    const { history } = setup()
    history.record('one', at('A', 0), at('A', 1))
    await history.undo()
    expect(history.canRedo()).toBe(true)
    history.record('two', at('B', 0), at('B', 1))
    expect(history.canRedo()).toBe(false)
    expect(await history.redo()).toEqual({ kind: 'empty', direction: 'redo' })
  })

  it('merges entries with the same key inside the window and keeps the first before', async () => {
    const { history, applied, tick } = setup()
    history.record('nudge of A', at('A', 0), at('A', 10), 'nudge:A')
    tick(MERGE_WINDOW_MS - 1)
    history.record('nudge of A', at('A', 10), at('A', 20), 'nudge:A')
    await history.undo()
    expect(applied).toEqual([at('A', 0)])
    expect(history.canUndo()).toBe(false)
    await history.redo()
    expect(applied[1]).toEqual(at('A', 20))
  })

  it('keeps entries apart after the window, for another key, or without a key', async () => {
    const { history, tick } = setup()
    history.record('a', at('A', 0), at('A', 10), 'nudge:A')
    tick(MERGE_WINDOW_MS)
    history.record('b', at('A', 10), at('A', 20), 'nudge:A')
    history.record('c', at('B', 0), at('B', 5), 'nudge:B')
    history.record('d', at('B', 5), at('B', 9))
    let count = 0
    while (history.canUndo()) {
      await history.undo()
      count += 1
    }
    expect(count).toBe(4)
  })

  it('does not merge into an entry that was redone', async () => {
    const { history } = setup()
    history.record('a', at('A', 0), at('A', 10), 'nudge:A')
    await history.undo()
    await history.redo()
    history.record('b', at('A', 10), at('A', 20), 'nudge:A')
    await history.undo()
    expect(history.canUndo()).toBe(true)
  })

  it('drops an entry whose board is gone and names it', async () => {
    const { history } = setup(() => ({
      ok: false,
      status: 404,
      error: 'no board named A on page p',
    }))
    history.record('move of A', at('A', 0), at('A', 1))
    const outcome = await history.undo()
    expect(outcome).toEqual({ kind: 'dropped', direction: 'undo', name: 'A' })
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
    expect(noticeFor(outcome)).toEqual({
      message: 'Could not undo: A no longer exists',
      tone: 'error',
    })
  })

  it('drops a redo entry on 400 and falls back to the first board of the edit', async () => {
    let fail = false
    const { history } = setup(() =>
      fail ? { ok: false, status: 400, error: 'bad' } : { ok: true },
    )
    history.record('move', at('A', 0), at('A', 1))
    await history.undo()
    fail = true
    const outcome = await history.redo()
    expect(outcome).toEqual({ kind: 'dropped', direction: 'redo', name: 'A' })
    expect(history.canRedo()).toBe(false)
    expect(noticeFor(outcome)?.message).toBe('Could not redo: A no longer exists')
  })

  it('keeps the entry when the failure is not a missing board', async () => {
    const { history } = setup(() => ({ ok: false, status: 500, error: 'boom' }))
    history.record('move', at('A', 0), at('A', 1))
    expect((await history.undo()).kind).toBe('failed')
    expect(history.canUndo()).toBe(true)
  })

  it('names what was undone and redone', () => {
    expect(noticeFor({ kind: 'done', direction: 'undo', label: 'move of 3 boards' })).toEqual({
      message: 'Undid move of 3 boards',
      tone: 'info',
    })
    expect(noticeFor({ kind: 'done', direction: 'redo', label: 'resize of A' })?.message).toBe(
      'Redid resize of A',
    )
  })

  it('clear empties both stacks', async () => {
    const { history } = setup()
    history.record('a', at('A', 0), at('A', 1))
    await history.undo()
    history.clear()
    expect(history.canUndo() || history.canRedo()).toBe(false)
  })
})
