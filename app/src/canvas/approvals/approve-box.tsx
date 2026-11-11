'use client'

import { Badge, Button, Textarea } from '../../ui'
import { Check } from '../../ui/icons'
import { useState } from 'react'
import { SessionPicker } from '../comments/session-picker'
import { useSession } from '../comments/use-session'
import { type ApproveInput, type BoardApproval, approvalStateOf } from './use-approvals'

/**
 * Approve a board: the chosen Claude session gets a turn that says the user confirmed the board,
 * so it can build it. The note is optional, for anything to add.
 */
export function ApproveBox({
  board,
  approval,
  onApprove,
}: {
  board: string
  approval: BoardApproval | undefined
  onApprove: (input: ApproveInput) => Promise<void>
}) {
  const state = approvalStateOf(approval)
  const { sessions, loaded, sessionId, pick } = useSession()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const approve = async () => {
    if (!sessionId) return
    setPending(true)
    setError(null)
    try {
      await onApprove({ board, sessionId, note })
      setNote('')
      setSent(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-label="Approve" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs text-muted-foreground">Approval</h3>
        {state === 'approved' ? (
          <Badge tone="success" size="sm">
            Approved
          </Badge>
        ) : state === 'changed' ? (
          <Badge tone="warning" size="sm">
            Changed since approval
          </Badge>
        ) : null}
      </div>
      <Textarea
        aria-label="Note for Claude (optional)"
        placeholder="Note for Claude (optional)"
        className="min-h-16 text-sm"
        maxLength={2000}
        value={note}
        onChange={(event) => {
          setNote(event.target.value)
          setSent(false)
        }}
      />
      <SessionPicker sessions={sessions} loaded={loaded} sessionId={sessionId} onPick={pick} />
      <Button
        size="sm"
        icon={<Check className="size-4" />}
        disabled={!sessionId}
        pending={pending}
        onClick={() => void approve()}
      >
        Approve and build
      </Button>
      {approval?.status === 'queued' ? (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Waiting for Claude to receive it.
        </p>
      ) : sent ? (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Sent. Claude will build {board}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
