'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '../ui'
import { rank } from '../lib/search-match'
import { useMountEffect } from './use-mount-effect'

export type SearchBoard = {
  name: string
  title: string
  page: string
  pageTitle: string
  section?: string
  sectionTitle?: string
  width: number
  height: number
  usedBy: number
  interactive: boolean
}
export type SearchSection = { id: string; title: string; page: string; pageTitle: string; boards: number }
export type SearchPage = { id: string; title: string; boardCount: number }
export type SearchData = { boards: SearchBoard[]; sections: SearchSection[]; pages: SearchPage[] }
export type SearchAction = { id: string; label: string; hint?: string; run: () => void }

type Kind = 'board' | 'component' | 'section' | 'page' | 'action'
type Row = { kind: Kind; key: string; title: string; sub: string; meta: string; open: (play: boolean) => void }
type Group = { label: string; rows: Row[] }
type Recent = { kind: Kind; key: string }

const RECENT_KEY = 'irsim.search.recent'
const RECENT_MAX = 8
const GROUP_MAX = 6

const ICONS: Record<Kind, string> = {
  board: 'M4 5h16v14H4z',
  component: 'M12 3l9 9-9 9-9-9z',
  section: 'M4 4h16v16H4z M4 9h16',
  page: 'M6 3h9l4 4v14H6z',
  action: 'M13 2 4 14h7l-1 8 9-12h-7z',
}

const KIND_LABEL: Record<Kind, string> = {
  board: 'Board',
  component: 'Board',
  section: 'Section',
  page: 'Page',
  action: 'Action',
}

const readRecent = (): Recent[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is Recent =>
          typeof item === 'object' && item !== null && typeof item.kind === 'string' && typeof item.key === 'string',
      )
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

const writeRecent = (entry: Recent) => {
  try {
    const rest = readRecent().filter((item) => !(item.kind === entry.kind && item.key === entry.key))
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...rest].slice(0, RECENT_MAX)))
  } catch {}
}

const sectionKey = (section: SearchSection) => `${section.page}:${section.id}`

type Handlers = {
  actions: SearchAction[]
  onOpenBoard: (board: SearchBoard, options?: { play?: boolean }) => void
  onOpenSection: (section: SearchSection) => void
  onOpenPage: (page: SearchPage) => void
}

const boardRow = (board: SearchBoard, kind: 'board' | 'component', handlers: Handlers): Row => ({
  kind,
  key: board.name,
  title: board.title,
  sub: board.name,
  meta: kind === 'component' ? `used by ${board.usedBy}` : board.pageTitle,
  open: (play) => handlers.onOpenBoard(board, play ? { play: true } : undefined),
})

const sectionRow = (section: SearchSection, meta: string, handlers: Handlers): Row => ({
  kind: 'section',
  key: sectionKey(section),
  title: section.title,
  sub: '',
  meta,
  open: () => handlers.onOpenSection(section),
})

const pageRow = (page: SearchPage, meta: string, handlers: Handlers): Row => ({
  kind: 'page',
  key: page.id,
  title: page.title,
  sub: '',
  meta,
  open: () => handlers.onOpenPage(page),
})

const actionRow = (action: SearchAction, meta: string): Row => ({
  kind: 'action',
  key: action.id,
  title: action.label,
  sub: '',
  meta,
  open: () => action.run(),
})

const boardsLabel = (count: number) => `${count} ${count === 1 ? 'board' : 'boards'}`

const resultGroups = (query: string, data: SearchData, handlers: Handlers): Group[] => {
  const boards = rank(data.boards, query, (board) => [board.name, board.title])
  const components = boards.filter((board) => board.usedBy > 0)
  const sections = rank(data.sections, query, (section) => [section.title])
  const pages = rank(data.pages, query, (page) => [page.title, page.id])
  const actions = rank(handlers.actions, query, (action) => [action.label])
  return [
    { label: 'Boards', rows: boards.slice(0, GROUP_MAX).map((board) => boardRow(board, 'board', handlers)) },
    { label: 'Components', rows: components.slice(0, GROUP_MAX).map((board) => boardRow(board, 'component', handlers)) },
    { label: 'Sections', rows: sections.slice(0, GROUP_MAX).map((section) => sectionRow(section, section.pageTitle, handlers)) },
    { label: 'Pages', rows: pages.slice(0, GROUP_MAX).map((page) => pageRow(page, boardsLabel(page.boardCount), handlers)) },
    { label: 'Actions', rows: actions.slice(0, GROUP_MAX).map((action) => actionRow(action, action.hint ?? '')) },
  ].filter((group) => group.rows.length > 0)
}

const recentGroups = (data: SearchData, handlers: Handlers): Group[] => {
  const rows: Row[] = []
  for (const { kind, key } of readRecent()) {
    let row: Row | undefined
    if (kind === 'board' || kind === 'component') {
      const board = data.boards.find((candidate) => candidate.name === key)
      if (board) row = boardRow(board, kind, handlers)
    } else if (kind === 'section') {
      const section = data.sections.find((candidate) => sectionKey(candidate) === key)
      if (section) row = sectionRow(section, '', handlers)
    } else if (kind === 'page') {
      const page = data.pages.find((candidate) => candidate.id === key)
      if (page) row = pageRow(page, '', handlers)
    } else if (kind === 'action') {
      const action = handlers.actions.find((candidate) => candidate.id === key)
      if (action) row = actionRow(action, '')
    }
    if (row) rows.push({ ...row, meta: KIND_LABEL[kind] })
  }
  return rows.length > 0 ? [{ label: 'Recent', rows }] : []
}

export type SearchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  actions: SearchAction[]
  onOpenBoard: (board: SearchBoard, options?: { play?: boolean }) => void
  onOpenSection: (section: SearchSection) => void
  onOpenPage: (page: SearchPage) => void
}

export function SearchDialog(props: SearchDialogProps) {
  const [data, setData] = useState<SearchData | null>(null)
  if (!props.open) return null
  return <SearchPanel {...props} data={data} onData={setData} />
}

function SearchPanel({
  onOpenChange,
  actions,
  onOpenBoard,
  onOpenSection,
  onOpenPage,
  data,
  onData,
}: SearchDialogProps & { data: SearchData | null; onData: (data: SearchData) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useMountEffect(() => {
    const previous = document.activeElement
    inputRef.current?.focus()
    const controller = new AbortController()
    fetch('/api/search', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<SearchData>) : Promise.reject(new Error('search'))))
      .then(onData)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
      })
    return () => {
      controller.abort()
      if (previous instanceof HTMLElement) previous.focus()
    }
  })

  const trimmed = query.trim()
  const handlers: Handlers = { actions, onOpenBoard, onOpenSection, onOpenPage }
  const groups = trimmed
    ? resultGroups(trimmed, data ?? { boards: [], sections: [], pages: [] }, handlers)
    : data
      ? recentGroups(data, handlers)
      : []
  const rows = groups.flatMap((group) => group.rows)
  const current = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current, query])

  const choose = (row: Row | undefined, play: boolean) => {
    if (!row) return
    writeRecent({ kind: row.kind, key: row.key })
    onOpenChange(false)
    row.open(play)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (rows.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[current]
      choose(row, event.shiftKey && (row?.kind === 'board' || row?.kind === 'component'))
    } else if (event.key === 'Tab') {
      event.preventDefault()
    }
  }

  let index = -1
  const empty = trimmed !== '' && rows.length === 0 && (data !== null || failed)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24"
      style={{ background: 'color-mix(in srgb, var(--foreground) 32%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
        className="flex max-h-[480px] w-[600px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-foreground shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <span className="inline-flex shrink-0 text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={rows.length > 0 ? `search-row-${current}` : undefined}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder="Search boards, components, sections, pages, actions"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            className="min-w-0 flex-1 truncate bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</span>
        </div>
        <div ref={listRef} id="search-results" role="listbox" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1">
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="flex flex-col">
              <div className="flex h-7 items-center px-2 text-xs font-semibold text-muted-foreground">{group.label}</div>
              {group.rows.map((row) => {
                index += 1
                const position = index
                return (
                  <div
                    key={`${row.kind}:${row.key}`}
                    id={`search-row-${position}`}
                    role="option"
                    aria-selected={position === current}
                    onMouseMove={() => setActive(position)}
                    onClick={(event) => choose(row, event.shiftKey && (row.kind === 'board' || row.kind === 'component'))}
                    className={cn(
                      'flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-[10px] px-2',
                      position === current && 'bg-secondary',
                    )}
                  >
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={ICONS[row.kind]} />
                      </svg>
                    </span>
                    <span className="min-w-0 truncate text-sm text-foreground">{row.title}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{row.sub}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{row.meta}</span>
                  </div>
                )
              })}
            </div>
          ))}
          {empty && (
            <div className="flex flex-col items-center justify-center gap-1 px-2 py-12">
              <span className="text-sm text-foreground">No results for “{trimmed}”</span>
              <span className="text-xs text-muted-foreground">Try a board name, a section or an action.</span>
            </div>
          )}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-xs text-muted-foreground">
          <span>↑↓ move</span>
          <span>Enter open</span>
          <span>Shift+Enter play</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
