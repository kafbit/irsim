'use client'

import { type KeyboardEvent, useId, useState } from 'react'
import { AgentLogo } from '../../ui/agent-logo'
import { Check, ChevronsUpDown, GitBranch } from '../../ui/icons'
import type { Session } from './types'

function Branch({ branch, listening = false }: { branch: string | undefined; listening?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      {branch ? (
        <>
          <GitBranch aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate font-mono">{branch}</span>
        </>
      ) : null}
      {listening ? <span className="shrink-0">· listening</span> : null}
    </span>
  )
}

/**
 * The agent session a send goes to: its logo, title and branch, and a listbox to switch when several
 * listen. `compact` is the top bar row, one line high, whose listbox opens downward.
 */
export function SessionRow({
  sessions,
  loaded,
  sessionId,
  onPick,
  compact = false,
}: {
  sessions: Session[]
  loaded: boolean
  sessionId: string | null
  onPick: (id: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const several = sessions.length > 1
  const current = sessions.find((session) => session.id === sessionId)

  if (sessions.length === 0) {
    if (!loaded) return null
    return (
      <div
        role="status"
        title="Run /irsim in your coding agent"
        className={`flex items-center gap-2.5 border border-dashed border-border-strong px-2.5 ${compact ? 'rounded-lg py-[5px]' : 'rounded-[10px] py-2'}`}
      >
        <span
          aria-hidden="true"
          className="box-border size-4 shrink-0 rounded-full border border-dashed border-border-strong"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] leading-5 font-medium">No agent session listening</span>
          {compact ? null : (
            <span className="text-xs text-muted-foreground">
              Run <code className="font-mono">/irsim</code> in your coding agent
            </span>
          )}
        </span>
      </div>
    )
  }

  const choose = (id: string) => {
    onPick(id)
    setOpen(false)
  }
  const openMenu = () => {
    setActive(Math.max(0, sessions.findIndex((session) => session.id === sessionId)))
    setOpen(true)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return openMenu()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index + step + sessions.length) % sessions.length)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const target = sessions[active]
      if (open && target) choose(target.id)
      else openMenu()
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label="Agent session"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center gap-2.5 border border-border bg-card px-2.5 text-start ${compact ? 'rounded-lg py-[5px]' : 'rounded-[10px] py-2'}  text-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer`}
      >
        {current ? <AgentLogo agent={current.agent} /> : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] leading-5 font-medium">
            {current ? current.title : 'Pick a session'}
          </span>
          {current && !compact ? <Branch branch={current.branch} listening /> : null}
        </span>
        {several ? (
          <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
            {sessions.length}
          </span>
        ) : null}
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Agent sessions"
          className={`absolute inset-x-0 z-10 ${compact ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'} m-0 flex list-none flex-col gap-0.5 rounded-xl border border-border bg-card p-1 shadow-[0_14px_36px_rgba(20,22,26,0.14)]`}
        >
          {sessions.map((session, index) => (
            <li
              key={session.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={session.id === sessionId}
              tabIndex={-1}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(session.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${index === active || session.id === sessionId ? 'bg-accent' : ''}`}
            >
              <AgentLogo agent={session.agent} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{session.title}</span>
                <Branch branch={session.branch} />
              </span>
              <span aria-hidden="true" className="flex w-3.5 shrink-0 justify-center">
                {session.id === sessionId ? <Check className="size-3.5" /> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
