import { describe, expect, it } from 'vitest'
import { commandFor, zoomChord } from '../src/canvas/keymap'
import { NO_SELECTION, reduceSelection } from '../src/canvas/selection'

const key = (key: string, extra: { code?: string; shiftKey?: boolean } = {}) =>
  commandFor({ key, code: extra.code ?? '', shiftKey: extra.shiftKey ?? false })

describe('reduceSelection', () => {
  it('select sets the board and leaves interaction', () => {
    const interacting = { name: 'A', interacting: true }
    expect(reduceSelection(NO_SELECTION, { type: 'select', name: 'A' })).toEqual({
      name: 'A',
      interacting: false,
    })
    expect(reduceSelection(interacting, { type: 'select', name: 'B' })).toEqual({
      name: 'B',
      interacting: false,
    })
  })

  it('selecting the same board again returns the same state', () => {
    const state = { name: 'A', interacting: false }
    expect(reduceSelection(state, { type: 'select', name: 'A' })).toBe(state)
  })

  it('interact needs a board, from the action or the selection', () => {
    expect(reduceSelection(NO_SELECTION, { type: 'interact' })).toBe(NO_SELECTION)
    expect(reduceSelection({ name: 'A', interacting: false }, { type: 'interact' })).toEqual({
      name: 'A',
      interacting: true,
    })
    expect(reduceSelection(NO_SELECTION, { type: 'interact', name: 'B' })).toEqual({
      name: 'B',
      interacting: true,
    })
  })

  it('Esc leaves interaction first, then deselects, then does nothing', () => {
    const first = reduceSelection({ name: 'A', interacting: true }, { type: 'escape' })
    expect(first).toEqual({ name: 'A', interacting: false })
    const second = reduceSelection(first, { type: 'escape' })
    expect(second).toEqual(NO_SELECTION)
    expect(reduceSelection(second, { type: 'escape' })).toBe(second)
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
