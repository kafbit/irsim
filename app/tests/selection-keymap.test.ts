import { describe, expect, it } from 'vitest'
import { commandFor, modChord, zoomChord } from '../src/canvas/keymap'
import { NO_SELECTION, reduceSelection } from '../src/canvas/selection'

const key = (key: string, extra: { code?: string; shiftKey?: boolean } = {}) =>
  commandFor({ key, code: extra.code ?? '', shiftKey: extra.shiftKey ?? false })

const state = (names: string[], interacting = false) => ({ names, interacting })

describe('reduceSelection', () => {
  it('select sets one board and leaves interaction', () => {
    expect(reduceSelection(NO_SELECTION, { type: 'select', name: 'A' })).toEqual(state(['A']))
    expect(reduceSelection(state(['A'], true), { type: 'select', name: 'B' })).toEqual(state(['B']))
    expect(reduceSelection(state(['A', 'B']), { type: 'select', name: 'A' })).toEqual(state(['A']))
  })

  it('select null clears, and the same object comes back when nothing changes', () => {
    expect(reduceSelection(state(['A']), { type: 'select', name: null })).toBe(NO_SELECTION)
    expect(reduceSelection(NO_SELECTION, { type: 'select', name: null })).toBe(NO_SELECTION)
    const current = state(['A'])
    expect(reduceSelection(current, { type: 'select', name: 'A' })).toBe(current)
  })

  it('toggle adds a missing board and removes a selected one', () => {
    expect(reduceSelection(state(['A']), { type: 'toggle', name: 'B' })).toEqual(state(['A', 'B']))
    expect(reduceSelection(state(['A', 'B']), { type: 'toggle', name: 'A' })).toEqual(state(['B']))
    expect(reduceSelection(state(['A']), { type: 'toggle', name: 'A' })).toBe(NO_SELECTION)
  })

  it('add keeps the selection and skips duplicates', () => {
    expect(reduceSelection(state(['A']), { type: 'add', names: ['B', 'A', 'C'] })).toEqual(
      state(['A', 'B', 'C']),
    )
    const current = state(['A', 'B'])
    expect(reduceSelection(current, { type: 'add', names: ['B'] })).toBe(current)
  })

  it('set and selectAll replace the selection', () => {
    expect(reduceSelection(state(['A']), { type: 'set', names: ['B', 'C'] })).toEqual(
      state(['B', 'C']),
    )
    expect(reduceSelection(state(['A']), { type: 'selectAll', names: ['A', 'B', 'B'] })).toEqual(
      state(['A', 'B']),
    )
    const current = state(['A', 'B'])
    expect(reduceSelection(current, { type: 'set', names: ['A', 'B'] })).toBe(current)
    expect(reduceSelection(current, { type: 'set', names: [] })).toBe(NO_SELECTION)
  })

  it('any change of the selection leaves interaction', () => {
    expect(reduceSelection(state(['A'], true), { type: 'toggle', name: 'B' })).toEqual(
      state(['A', 'B']),
    )
    expect(reduceSelection(state(['A'], true), { type: 'set', names: ['A'] })).toEqual(state(['A']))
  })

  it('interact needs exactly one board, from the action or the selection', () => {
    expect(reduceSelection(NO_SELECTION, { type: 'interact' })).toBe(NO_SELECTION)
    const many = state(['A', 'B'])
    expect(reduceSelection(many, { type: 'interact' })).toBe(many)
    expect(reduceSelection(state(['A']), { type: 'interact' })).toEqual(state(['A'], true))
    expect(reduceSelection(many, { type: 'interact', name: 'B' })).toEqual(state(['B'], true))
    const live = state(['A'], true)
    expect(reduceSelection(live, { type: 'interact' })).toBe(live)
  })

  it('Esc leaves interaction first, then clears, then does nothing', () => {
    const first = reduceSelection(state(['A'], true), { type: 'escape' })
    expect(first).toEqual(state(['A']))
    const second = reduceSelection(first, { type: 'escape' })
    expect(second).toEqual(NO_SELECTION)
    expect(reduceSelection(second, { type: 'escape' })).toBe(second)
    expect(reduceSelection(state(['A', 'B']), { type: 'escape' })).toBe(NO_SELECTION)
  })
})

describe('modChord', () => {
  const chord = (
    key: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>,
  ) => modChord({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

  it('maps undo and redo', () => {
    expect(chord('z', { ctrlKey: true })).toBe('undo')
    expect(chord('z', { metaKey: true })).toBe('undo')
    expect(chord('Z', { ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(chord('Z', { metaKey: true, shiftKey: true })).toBe('redo')
    expect(chord('y', { ctrlKey: true })).toBe('redo')
    expect(chord('y', { metaKey: true })).toBeNull()
  })

  it('maps select all and global search', () => {
    expect(chord('a', { ctrlKey: true })).toBe('select-all')
    expect(chord('k', { metaKey: true })).toBe('global-search')
    expect(chord('K', { ctrlKey: true })).toBe('global-search')
  })

  it('ignores the keys without Ctrl or Cmd, and with Alt', () => {
    expect(chord('z', {})).toBeNull()
    expect(chord('z', { ctrlKey: true, altKey: true })).toBeNull()
    expect(chord('q', { ctrlKey: true })).toBeNull()
  })
})

describe('commandFor', () => {
  it('maps the documented shortcuts', () => {
    expect(key('!', { code: 'Digit1', shiftKey: true })).toBe('fit-page')
    expect(key('@', { code: 'Digit2', shiftKey: true })).toBe('fit-selection')
    expect(key(')', { code: 'Digit0', shiftKey: true })).toBe('actual-size')
    expect(key('+', { shiftKey: true })).toBe('zoom-in')
    expect(key('=')).toBe('zoom-in')
    expect(key('-')).toBe('zoom-out')
    expect(key('n')).toBe('next-board')
    expect(key('N', { shiftKey: true })).toBe('previous-board')
    expect(key('Enter')).toBe('interact')
    expect(key('Escape')).toBe('escape')
    expect(key('/')).toBe('search')
    expect(key('v')).toBe('tool-move')
    expect(key('h')).toBe('tool-hand')
    expect(key('S', { shiftKey: true })).toBe('create-section')
  })

  it('keeps plain 0 and 1 as fit and 100%', () => {
    expect(key('0')).toBe('fit-page')
    expect(key('1')).toBe('actual-size')
  })

  it('maps the arrow keys to a near nudge, and with Shift to a far one', () => {
    expect(key('ArrowLeft')).toBe('nudge-left')
    expect(key('ArrowRight')).toBe('nudge-right')
    expect(key('ArrowUp')).toBe('nudge-up')
    expect(key('ArrowDown')).toBe('nudge-down')
    expect(key('ArrowLeft', { shiftKey: true })).toBe('nudge-far-left')
    expect(key('ArrowDown', { shiftKey: true })).toBe('nudge-far-down')
  })

  it('ignores other keys', () => {
    expect(key('q')).toBeNull()
    expect(key('Q', { shiftKey: true })).toBeNull()
    expect(key('constructor')).toBeNull()
  })
})

describe('zoomChord', () => {
  const chord = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>>) =>
    zoomChord({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods })

  it('zooms in on Ctrl or Cmd with + or =', () => {
    expect(chord('=', { ctrlKey: true })).toBe('zoom-in')
    expect(chord('+', { metaKey: true })).toBe('zoom-in')
  })

  it('zooms out on Ctrl or Cmd with - or _', () => {
    expect(chord('-', { ctrlKey: true })).toBe('zoom-out')
    expect(chord('_', { metaKey: true })).toBe('zoom-out')
  })

  it('ignores the keys without Ctrl or Cmd, and with Alt', () => {
    expect(chord('=', {})).toBeNull()
    expect(chord('-', { ctrlKey: true, altKey: true })).toBeNull()
  })
})
