import { describe, expect, test } from 'bun:test'
import { askScope, canGenerate, canSend, hintFor, scopeLabel } from '../src/canvas/composer-model'

describe('composer scope', () => {
  test('chip text per scope', () => {
    expect(scopeLabel({ kind: 'none' })).toBeNull()
    expect(scopeLabel({ kind: 'page', title: 'Checkout' })).toBe('Checkout')
    expect(scopeLabel({ kind: 'board', name: 'dialog', title: 'Dialog' })).toBe('Dialog')
    expect(scopeLabel({ kind: 'boards', names: ['a', 'b', 'c'] })).toBe('3 boards')
    expect(scopeLabel({ kind: 'section', id: 's1', title: 'Forms' })).toBe('Forms')
  })

  test('maps to the ask scope', () => {
    expect(askScope({ kind: 'none' })).toEqual({ scope: 'page' })
    expect(askScope({ kind: 'page', title: 'T' })).toEqual({ scope: 'page' })
    expect(askScope({ kind: 'board', name: 'dialog', title: 'D' })).toEqual({
      scope: 'board',
      board: 'dialog',
    })
    expect(askScope({ kind: 'boards', names: ['a', 'b'] })).toEqual({
      scope: 'boards',
      boards: ['a', 'b'],
    })
    expect(askScope({ kind: 'section', id: 's1', title: 'F' })).toEqual({
      scope: 'section',
      section: 's1',
    })
  })
})

describe('composer send state', () => {
  const ready = { text: 'hi', sessionId: 's', uploading: 0, pending: false }

  test('sends with text and a session', () => {
    expect(canSend(ready)).toBe(true)
  })

  test('blocks on empty text, no session, uploads or a pending send', () => {
    expect(canSend({ ...ready, text: '  ' })).toBe(false)
    expect(canSend({ ...ready, sessionId: null })).toBe(false)
    expect(canSend({ ...ready, uploading: 1 })).toBe(false)
    expect(canSend({ ...ready, pending: true })).toBe(false)
  })

  test('generate needs a session and a preset', () => {
    expect(canGenerate({ sessionId: 's', presets: 2, pending: false })).toBe(true)
    expect(canGenerate({ sessionId: null, presets: 2, pending: false })).toBe(false)
    expect(canGenerate({ sessionId: 's', presets: 0, pending: false })).toBe(false)
  })

  test('hint shows the no session text only once sessions loaded', () => {
    expect(hintFor(null, false)).toBe('Enter sends, Shift+Enter adds a line')
    expect(hintFor(null, true)).toContain('/irsim')
    expect(hintFor('s', true)).toBe('Enter sends, Shift+Enter adds a line')
  })
})
