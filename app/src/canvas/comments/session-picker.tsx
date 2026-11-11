'use client'

import { Select } from '../../ui'
import type { Session } from './types'

/** Which Claude session a send or an approval goes to: a select for several, a line for one. */
export function SessionPicker({
  sessions,
  loaded,
  sessionId,
  onPick,
}: {
  sessions: Session[]
  loaded: boolean
  sessionId: string | null
  onPick: (id: string) => void
}) {
  const options = sessions.map((session) => ({ value: session.id, label: session.label }))
  if (sessionId && !sessions.some((session) => session.id === sessionId)) {
    options.unshift({ value: sessionId, label: sessionId })
  }
  if (options.length > 1) {
    return (
      <Select aria-label="Claude session" value={sessionId ?? ''} onChange={onPick}>
        {sessionId ? null : <option value="">Pick a session</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    )
  }
  if (options[0]) {
    return <p className="m-0 truncate text-xs text-muted-foreground">Session: {options[0].label}</p>
  }
  return loaded ? (
    <p className="m-0 text-xs text-muted-foreground">
      No Claude session. Run /canvas in Claude Code.
    </p>
  ) : null
}
