'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Ellipsis, PanelLeft, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui'
import type { PendingBoards } from './approvals/pending'
import { SessionRow } from './comments/session-row'
import { useSession } from './comments/use-session'
import { sendPageRequest } from './page-requests'
import { useTheme } from './use-theme'

const ICON = 'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border p-0'

/**
 * The bar above the sidebar and the canvas: the sidebar toggle, the page name, the search field,
 * the listening agent session, `Approve all and build` (shown while a board is New or Changed, it
 * sends every board of the page in one turn) and the More menu.
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
  pageId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onShortcuts,
}: {
  pageTitle: string
  boards: string[]
  pending: PendingBoards
  sidebarShown: boolean
  onToggleSidebar: () => void
  onSearch: () => void
  onSettings: () => void
  onApprove: (input: { boards: string[]; sessionId: string }) => Promise<void>
  pageId: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onShortcuts?: () => void
}) {
  const { theme, toggle: toggleTheme } = useTheme()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = pending.changed.length + pending.added.length
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
  const reorganize = async () => {
    if (!session.sessionId) return
    setError(null)
    try {
      await sendPageRequest({ page: pageId, kind: 'reorganize', sessionId: session.sessionId })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

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
      {total > 0 ? (
        <button
          type="button"
          disabled={!ready || boards.length === 0}
          title={session.sessionId ? undefined : 'No agent session listening'}
          onClick={() => void run(boards)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Check size={16} aria-hidden="true" />
          Approve all and build
        </button>
      ) : null}
      <DropdownMenu dir="ltr">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More"
            className={`${ICON} border-transparent text-foreground hover:bg-accent`}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent lang="en" align="end" className="w-60">
          <DropdownMenuItem onSelect={onSettings}>Settings</DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canUndo} onSelect={onUndo}>
            Undo
            <span className="ms-auto text-xs text-muted-foreground">Ctrl Z</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canRedo} onSelect={onRedo}>
            Redo
            <span className="ms-auto text-xs text-muted-foreground">Shift Ctrl Z</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!session.sessionId} onSelect={() => void reorganize()}>
            Reorganize frames with agent
          </DropdownMenuItem>
          {onShortcuts ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onShortcuts}>Keyboard shortcuts</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
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
