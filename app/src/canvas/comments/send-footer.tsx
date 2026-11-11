'use client'

import { Button, Select } from '../../ui'
import { Send } from '../../ui/icons'
import { useState } from 'react'
import { sendLabel } from './model'
import type { Session } from './types'

/** The session picker and the Send button. With no live session there is nothing to send to. */
export function SendFooter({
  sessions,
  loaded,
  sessionId,
  draftCount,
  onPick,
  onSend,
}: {
  sessions: Session[]
  loaded: boolean
  sessionId: string | null
  draftCount: number
  onPick: (id: string) => void
  onSend: (sessionId: string) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const options = sessions.map((session) => ({ value: session.id, label: session.label }))
  if (sessionId && !sessions.some((session) => session.id === sessionId)) {
    options.unshift({ value: sessionId, label: sessionId })
  }

  const send = async () => {
    if (!sessionId) return
    setPending(true)
    await onSend(sessionId).catch(() => {})
    setPending(false)
  }

  return (
    <footer className="flex flex-col gap-2 border-t border-border p-4">
      {options.length > 1 ? (
        <Select
          id="canvas-session"
          aria-label="Claude session"
          value={sessionId ?? ''}
          onChange={onPick}
        >
          {sessionId ? null : <option value="">Pick a session</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : options[0] ? (
        <p className="m-0 truncate text-xs text-muted-foreground">Session: {options[0].label}</p>
      ) : loaded ? (
        <p className="m-0 text-xs text-muted-foreground">
          No Claude session. Run /canvas in Claude Code.
        </p>
      ) : null}
      <Button
        icon={<Send className="size-4" />}
        disabled={!sessionId || draftCount === 0}
        pending={pending}
        onClick={send}
      >
        {sendLabel(draftCount)}
      </Button>
    </footer>
  )
}
