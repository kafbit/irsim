'use client'

import { formatNumber } from '../lib/format-number'
import { Input } from '../ui'
import Link from 'next/link'
import { type Ref, useCallback, useState } from 'react'
import { CHROME_FORMAT } from './chrome-format'
import type { ManifestBoard, PageSummary } from './types'
import { UpdateNotice } from './update-notice'

const row =
  'block rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

function BoardRow({
  board,
  pageId,
  selected,
  onFocusBoard,
}: {
  board: ManifestBoard
  pageId: string
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
      className={`flex items-center gap-1 rounded-lg hover:bg-accent ${selected ? 'bg-secondary' : ''}`}
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
        href={`/p/${encodeURIComponent(pageId)}?board=${encodeURIComponent(board.name)}&alone=1`}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        Open alone
      </Link>
    </li>
  )
}

/** Pages with their board counts, then this page's boards with a search (`/` focuses it). */
export function Sidebar({
  pages,
  pageId,
  boards,
  selected,
  searchRef,
  onFocusBoard,
}: {
  pages: PageSummary[]
  pageId: string
  boards: ManifestBoard[]
  selected: string | null
  searchRef: Ref<HTMLInputElement>
  onFocusBoard: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = boards.filter(
    (board) =>
      needle === '' ||
      board.name.toLowerCase().includes(needle) ||
      board.title.toLowerCase().includes(needle),
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
        {shown.map((board) => (
          <BoardRow
            key={board.name}
            board={board}
            pageId={pageId}
            selected={board.name === selected}
            onFocusBoard={onFocusBoard}
          />
        ))}
        {shown.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">No boards match</li>
        ) : null}
      </ul>
      <UpdateNotice />
    </aside>
  )
}
