'use client'

import { Button } from '../../ui'
import { Send } from '../../ui/icons'
import { useState } from 'react'
import { sendLabel } from './model'
import { SessionRow } from './session-row'
import type { Session } from './types'

/** The session row and the Send button. With no live session there is nothing to send to. */
export function SendFooter({
  sessions,
  loaded,
  sessionId,
  draftCount,
  showSend = true,
  onPick,
  onSend,
}: {
  sessions: Session[]
  loaded: boolean
  sessionId: string | null
  draftCount: number
  showSend?: boolean
  onPick: (id: string) => void
  onSend: (sessionId: string) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const send = async () => {
    if (!sessionId) return
    setPending(true)
    await onSend(sessionId).catch(() => {})
    setPending(false)
  }

  return (
    <footer className="flex flex-col gap-2 border-t border-border p-4">
      <SessionRow sessions={sessions} loaded={loaded} sessionId={sessionId} onPick={onPick} />
      {showSend ? (
      <Button
        icon={<Send className="size-4" />}
        disabled={!sessionId || draftCount === 0}
        pending={pending}
        onClick={send}
      >
        {sendLabel(draftCount)}
      </Button>
      ) : null}
    </footer>
  )
}
