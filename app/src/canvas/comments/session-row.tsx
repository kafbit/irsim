'use client'

import { type KeyboardEvent, useId, useState } from 'react'
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

/** The Claude session a send goes to: its title and branch, and a listbox to switch when several listen. */
export function SessionRow({
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
        className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-border-strong px-2.5 py-2"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-input" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium">No Claude session listening</span>
          <span className="text-xs text-muted-foreground">
            Run <code className="font-mono">/irsim</code> in Claude Code
          </span>
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
    if (!several) return
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
        aria-label="Claude session"
        aria-haspopup={several ? 'listbox' : 'false'}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (several ? (open ? setOpen(false) : openMenu()) : undefined)}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-card px-2.5 py-2 text-start text-foreground focus-visible:outline-2 focus-visible:outline-ring ${several ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-success-foreground shadow-[0_0_0_3px_var(--success)]"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium">
            {current ? current.title : 'Pick a session'}
          </span>
          {current ? <Branch branch={current.branch} listening /> : null}
        </span>
        {several ? (
          <>
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
              {sessions.length}
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        ) : null}
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Claude sessions"
          className="absolute inset-x-0 bottom-[calc(100%+6px)] z-10 m-0 flex list-none flex-col gap-0.5 rounded-xl border border-border bg-card p-1 shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
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
