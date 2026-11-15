'use client'

import { formatNumber } from '../lib/format-number'
import { Input } from '../ui'
import { ChevronDown, Play } from '../ui/icons'
import Link from 'next/link'
import { Fragment, type ReactNode, type Ref, useCallback, useState } from 'react'
import { CHROME_FORMAT } from './chrome-format'
import { membersOf } from './sections'
import type { CanvasSection, ManifestBoard, PageSummary } from './types'
import { UpdateNotice } from './update-notice'
import { playHref } from './use-play-links'

const row =
  'block rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

function BoardRow({
  board,
  pageId,
  selected,
  indent = 0,
  onFocusBoard,
}: {
  board: ManifestBoard
  pageId: string
  /** Levels of sections the board sits in; each indents it by 12 px. */
  indent?: number
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
      style={{ marginInlineStart: indent * 12 }}
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

/** The dot of a section: its color, tokens only. */
const DOTS = {
  gray: 'var(--border-strong)',
  blue: 'var(--info-foreground)',
  green: 'var(--success-foreground)',
  amber: 'var(--warning-foreground)',
  purple: 'var(--rented-foreground)',
  red: 'var(--destructive)',
} as const

function SectionHeader({
  title,
  count,
  color,
  depth,
  onSelect,
}: {
  title: string
  count: number
  color: keyof typeof DOTS
  depth: number
  onSelect: () => void
}) {
  return (
    <li className="mt-2" style={{ marginInlineStart: depth * 12 }}>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-start hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown className="size-3.5" />
        </span>
        <span
          aria-hidden="true"
          data-color={color}
          className="size-2 shrink-0 rounded-full"
          style={{ background: DOTS[color] }}
        />
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
  const needle = query.trim().toLowerCase()
  const shown = boards.filter(
    (board) =>
      needle === '' ||
      board.name.toLowerCase().includes(needle) ||
      board.title.toLowerCase().includes(needle),
  )

  const known = new Set(sections.map((section) => section.id))
  const loose = shown.filter((board) => !board.section || !known.has(board.section))
  const renderBoard = (board: ManifestBoard, indent: number) => (
    <BoardRow
      key={board.name}
      board={board}
      pageId={pageId}
      selected={selected.includes(board.name)}
      indent={indent}
      onFocusBoard={onFocusBoard}
    />
  )
  // A section, its own boards, then its sub-sections, one level further in. A section with nothing
  // to show under the search is left out.
  const renderSection = (section: CanvasSection, depth: number, path: string[]): ReactNode => {
    if (path.includes(section.id)) return null
    const own = shown.filter((board) => board.section === section.id)
    const subtree = membersOf(section.id, shown, sections)
    if (subtree.length === 0) return null
    return (
      <Fragment key={section.id}>
        <SectionHeader
          title={section.title}
          count={subtree.length}
          color={section.color ?? 'gray'}
          depth={depth}
          onSelect={() => onSelectBoards(subtree)}
        />
        {own.map((board) => renderBoard(board, depth + 1))}
        {sections
          .filter((child) => child.parent === section.id)
          .map((child) => renderSection(child, depth + 1, [...path, section.id]))}
      </Fragment>
    )
  }
  // A section whose parent is missing is shown at the top level, as a section with no parent.
  const roots = sections.filter((section) => !section.parent || !known.has(section.parent))

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
        {loose.map((board) => renderBoard(board, 0))}
        {roots.map((section) => renderSection(section, 0, []))}
        {shown.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">No boards match</li>
        ) : null}
      </ul>
      <UpdateNotice />
    </aside>
  )
}
