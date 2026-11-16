'use client'

import {
  Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../../ui'
import { AgentLogo } from '../../ui/agent-logo'
import { Check, ChevronDown } from '../../ui/icons'
import type { Session } from './types'

export const NO_SESSION = 'No agent session listening'
const NO_TARGET = 'Pick a session for this comment'

/**
 * The session a sent comment goes to. Its replies and Approve and build go there. A comment whose
 * session ended shows "Pick a session" with a red border.
 */
export function CommentSession({
  sessions,
  sessionId,
  disabled,
  onPick,
}: {
  sessions: Session[]
  sessionId: string | null
  disabled: boolean
  onPick: (id: string) => void
}) {
  const current = sessions.find((session) => session.id === sessionId)
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">Session</span>
      <DropdownMenu dir="ltr">
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            aria-label="Comment session"
            title="Change the session this comment goes to"
            disabled={disabled || sessions.length === 0}
            className={`h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-lg bg-transparent px-2 text-xs font-normal text-foreground ${current ? 'border-border' : 'border-destructive'}`}
          >
            {current ? <AgentLogo agent={current.agent} /> : null}
            <span
              className={`min-w-0 flex-1 truncate text-start ${current ? '' : 'text-muted-foreground'}`}
            >
              {current ? current.title : 'Pick a session'}
            </span>
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent lang="en" align="end" className="w-64">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onSelect={() => {
                if (session.id !== sessionId) onPick(session.id)
              }}
              className="gap-2"
            >
              <AgentLogo agent={session.agent} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{session.title}</span>
              <span aria-hidden="true" className="flex w-3.5 shrink-0 justify-center">
                {session.id === sessionId ? <Check className="size-3.5" /> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Approve and build, with Resolve in its menu. Approve and build needs a live target session;
 * Resolve only closes the thread and always works.
 */
export function ApproveSplit({
  canBuild,
  busy,
  onApproveAndBuild,
  onResolve,
}: {
  canBuild: boolean
  busy: boolean
  onApproveAndBuild: () => void
  onResolve: () => void
}) {
  return (
    <DropdownMenu dir="ltr">
      <div className="flex items-center">
        <Button
          disabled={!canBuild}
          pending={busy}
          icon={<Check className="size-3.5" aria-hidden="true" />}
          title={canBuild ? 'Approve the board, resolve and build' : NO_TARGET}
          onClick={onApproveAndBuild}
          size="sm"
          className="flex-1 rounded-e-none"
        >
          Approve and build
        </Button>
        <span aria-hidden="true" className="h-8.5 w-px shrink-0 bg-border" />
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Resolve options"
            disabled={busy}
            size="sm"
            className="size-8.5 shrink-0 rounded-s-none p-0"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent lang="en" align="end" className="w-64">
        <DropdownMenuItem
          disabled={!canBuild}
          onSelect={onApproveAndBuild}
          className="flex-col items-start gap-0.5"
        >
          <span className="font-medium">Approve and build</span>
          <span className="text-xs text-muted-foreground">
            {canBuild
              ? 'Approves the board, resolves the thread and asks the agent to build it'
              : NO_TARGET}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onResolve} className="flex-col items-start gap-0.5">
          <span className="font-medium">Resolve</span>
          <span className="text-xs text-muted-foreground">Closes the thread without building</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
