'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, ChevronDown, PanelLeft, Search, Settings } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui'
import type { PendingBoards } from './approvals/pending'
import { SessionRow } from './comments/session-row'
import { useSession } from './comments/use-session'

const ICON = 'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border p-0'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The bar above the sidebar and the canvas: the sidebar toggle, the page name, the search field,
 * the listening agent session, Approve and build (with `Approve all and build` in its menu) and
 * Settings. Approve and build acts on the New and Changed boards and sends one turn.
 */
export function TopBar({
  pageTitle,
  boards,
  pending,
  sidebarShown,
  onToggleSidebar,
  onSearch,
  onSettings,
  onApprove,
}: {
  pageTitle: string
  boards: string[]
  pending: PendingBoards
  sidebarShown: boolean
  onToggleSidebar: () => void
  onSearch: () => void
  onSettings: () => void
  onApprove: (input: { boards: string[]; sessionId: string }) => Promise<void>
}) {
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = pending.changed.length + pending.added.length
  const pendingNames = [...pending.changed, ...pending.added]
  const ready = Boolean(session.sessionId) && !busy

  const run = async (names: string[]) => {
    if (!session.sessionId || names.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await onApprove({ boards: names, sessionId: session.sessionId })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const toggle = sidebarShown ? 'Hide sidebar' : 'Show sidebar'
  const sub =
    pending.changed.length > 0 && pending.added.length > 0
      ? `${pending.changed.length} changed, ${pending.added.length} new`
      : pending.added.length > 0
        ? plural(pending.added.length, 'new board')
        : plural(pending.changed.length, 'changed board')

  return (
    <header
      aria-label="Top bar"
      className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3"
    >
      <button
        type="button"
        aria-label={toggle}
        aria-pressed={sidebarShown}
        title="Toggle sidebar (Ctrl+\)"
        onClick={onToggleSidebar}
        className={`${ICON} border-transparent text-foreground hover:bg-accent`}
      >
        <PanelLeft size={16} aria-hidden="true" />
      </button>
      <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-1.5 text-[13px]">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          All pages
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <span dir="auto" className="max-w-56 truncate font-medium">
          {pageTitle}
        </span>
      </nav>
      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          aria-label="Search boards, sections and actions"
          onClick={onSearch}
          className="flex h-8 w-full max-w-105 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background ps-2.5 pe-2 text-start text-[13px] text-muted-foreground"
        >
          <Search size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search boards, sections and actions</span>
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 font-sans text-[11px] leading-[18px]">
            Ctrl K
          </kbd>
        </button>
      </div>
      <div className="w-65 shrink-0">
        <SessionRow
          compact
          sessions={session.sessions}
          loaded={session.loaded}
          sessionId={session.sessionId}
          onPick={session.pick}
        />
      </div>
      <DropdownMenu dir="ltr">
        {total > 0 ? (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={!ready}
              title={session.sessionId ? undefined : 'No agent session listening'}
              onClick={() => void run(pendingNames)}
              className="inline-flex h-8 items-center gap-1.5 rounded-s-lg border border-primary bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            >
              <Check size={16} aria-hidden="true" />
              Approve and build
              <span className="inline-flex h-4.5 items-center rounded-full bg-primary-foreground px-1.5 text-[11px] font-semibold text-primary">
                {total}
              </span>
            </button>
            <span aria-hidden="true" className="h-8 w-px shrink-0 bg-border" />
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Approve options"
                className={`${ICON} rounded-s-none border-primary bg-primary text-primary-foreground`}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </div>
        ) : (
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Approve options"
              className={`${ICON} border-border bg-card text-foreground`}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent lang="en" align="end" className="w-70">
          <DropdownMenuItem
            disabled={!ready || total === 0}
            onSelect={() => void run(pendingNames)}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">
              Approve {total > 0 ? plural(total, 'changed board') : 'changed boards'} and build
            </span>
            <span className="text-xs text-muted-foreground">
              {total > 0 ? sub : 'No changed boards'}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ready || boards.length === 0}
            onSelect={() => void run(boards)}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">Approve all and build</span>
            <span className="text-xs text-muted-foreground">
              {plural(boards.length, 'board')} on this page
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="Settings"
        onClick={onSettings}
        className={`${ICON} border-transparent text-foreground hover:bg-accent`}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
      {error ? (
        <p
          role="alert"
          className="absolute end-3 top-13 m-0 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-destructive shadow-lg"
        >
          {error}
        </p>
      ) : null}
    </header>
  )
}
