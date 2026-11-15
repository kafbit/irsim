'use client'

import { formatNumber } from '../lib/format-number'
import { Input } from '../ui'
import { ChevronDown, Play } from '../ui/icons'
import Link from 'next/link'
import { Fragment, type Ref, useCallback, useState } from 'react'
import { CHROME_FORMAT } from './chrome-format'
import type { CanvasSection, ManifestBoard, PageSummary } from './types'
import { SessionRow } from './comments/session-row'
import { useSession } from './comments/use-session'
import { UpdateNotice } from './update-notice'
import { playHref } from './use-play-links'

const row =
  'block rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

function BoardRow({
  board,
  pageId,
  selected,
  indent = false,
  onFocusBoard,
}: {
  board: ManifestBoard
  pageId: string
  indent?: boolean
  selected: boolean
  onFocusBoard: (name: string) => void
}) {
  const scrollIntoView = useCallback(
    (element: HTMLLIElement | null) => {
      if (selected) element?.scrollIntoView({ block: 'nearest' })
    },
    [selected],
  )
  return (
    <li
      ref={scrollIntoView}
      aria-current={selected ? 'true' : undefined}
      className={`flex items-center gap-1 rounded-lg hover:bg-accent ${indent ? 'ms-3' : ''} ${selected ? 'bg-secondary' : ''}`}
    >
      <button
        type="button"
        onClick={() => onFocusBoard(board.name)}
        className="min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-start focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span dir="auto" className="block truncate text-sm text-foreground">
          {board.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{board.name}</span>
      </button>
      <Link
        href={playHref(pageId, board.name, 'full')}
        aria-label={`Play ${board.title || board.name}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Play className="size-3 fill-current" />
        Play
      </Link>
    </li>
  )
}

function SectionHeader({
  title,
  count,
  onSelect,
}: {
  title: string
  count: number
  onSelect: () => void
}) {
  return (
    <li className="mt-2">
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-start hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown className="size-3.5" />
        </span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </button>
    </li>
  )
}

/** Pages with their board counts, then this page's boards with a search (`/` focuses it). */
export function Sidebar({
  pages,
  pageId,
  boards,
  sections,
  selected,
  searchRef,
  onFocusBoard,
  onSelectBoards,
}: {
  pages: PageSummary[]
  pageId: string
  boards: ManifestBoard[]
  sections: CanvasSection[]
  selected: string[]
  searchRef: Ref<HTMLInputElement>
  onFocusBoard: (name: string) => void
  onSelectBoards: (names: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const session = useSession()
  const needle = query.trim().toLowerCase()
  const shown = boards.filter(
    (board) =>
      needle === '' ||
      board.name.toLowerCase().includes(needle) ||
      board.title.toLowerCase().includes(needle),
  )

  const known = new Set(sections.map((section) => section.id))
  const loose = shown.filter((board) => !board.section || !known.has(board.section))
  const groups = sections
    .map((section) => ({
      section,
      members: shown.filter((board) => board.section === section.id),
    }))
    .filter((group) => group.members.length > 0)
  const renderBoard = (board: ManifestBoard, indent: boolean) => (
    <BoardRow
      key={board.name}
      board={board}
      pageId={pageId}
      selected={selected.includes(board.name)}
      indent={indent}
      onFocusBoard={onFocusBoard}
    />
  )

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-e border-border bg-card p-3">
      <nav aria-label="Pages" className="flex max-h-64 shrink-0 flex-col overflow-y-auto">
        <Link href="/" className={`${row} text-muted-foreground`}>
          All pages
        </Link>
        {pages.map((page) => (
          <Link
            key={page.id}
            href={`/p/${encodeURIComponent(page.id)}`}
            aria-current={page.id === pageId ? 'page' : undefined}
            className={`${row} flex items-center gap-2 ${page.id === pageId ? 'bg-secondary font-medium' : ''}`}
          >
            <span dir="auto" className="min-w-0 flex-1 truncate">
              {page.title}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(page.boardCount, CHROME_FORMAT)}
            </span>
          </Link>
        ))}
      </nav>
      <Input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search boards"
        aria-label="Search boards"
        dir="ltr"
        lang="en"
      />
      <p className="text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? 'board' : 'boards'}
      </p>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loose.map((board) => renderBoard(board, false))}
        {groups.map(({ section, members }) => (
          <Fragment key={section.id}>
            <SectionHeader
              title={section.title}
              count={members.length}
              onSelect={() => onSelectBoards(members.map((board) => board.name))}
            />
            {members.map((board) => renderBoard(board, true))}
          </Fragment>
        ))}
        {shown.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">No boards match</li>
        ) : null}
      </ul>
      <UpdateNotice />
      <div className="-mx-3 -mb-3 border-t border-border p-3">
        <SessionRow
          sessions={session.sessions}
          loaded={session.loaded}
          sessionId={session.sessionId}
          onPick={session.pick}
        />
      </div>
    </aside>
  )
}
