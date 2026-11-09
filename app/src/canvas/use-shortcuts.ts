'use client'

import { useEffect } from 'react'
import { type Command, commandFor, zoomChord } from './keymap'

/** A handler that returns `false` did not handle the key, so the browser keeps its default action. */
export type CommandHandlers = Partial<Record<Command, () => unknown>>

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const OVERLAYS = '[role="menu"], [role="dialog"], [role="listbox"]'
const ACTIVATES = 'button, a, summary, [role="button"]'

/** Typing, an open menu and a modifier belong to someone else. Enter and Space also belong to a focused button or link. */
function belongsElsewhere(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target instanceof Element ? event.target : null
  if (!target) return false
  if (target.closest(EDITABLE) || target.closest(OVERLAYS)) return true
  const activating = event.key === 'Enter' || event.key === ' '
  return activating && target.closest(ACTIVATES) !== null
}

/**
 * Keyboard shortcuts on `window`, so they work after a click on the sidebar too. Space is a hold:
 * `onSpace` gets `true` on press and `false` on release or when the window loses focus.
 */
export function useShortcuts(handlers: CommandHandlers, onSpace: (held: boolean) => void) {
  // Syncs with the window's key events, an external system. Re-subscribes when a handler changes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = zoomChord(event)
      if (chord) {
        event.preventDefault()
        handlers[chord]?.()
        return
      }
      if (belongsElsewhere(event)) return
      if (event.key === ' ') {
        event.preventDefault()
        onSpace(true)
        return
      }
      const command = commandFor(event)
      const handler = command && handlers[command]
      if (!handler) return
      if (handler() !== false) event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => event.key === ' ' && onSpace(false)
    const onBlur = () => onSpace(false)
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; details?: { command?: string } } | null
      if (data?.type !== 'zoom-chord') return
      const command = data.details?.command
      if (command === 'zoom-in' || command === 'zoom-out') handlers[command]?.()
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('message', onMessage)
    }
  }, [handlers, onSpace])
}
