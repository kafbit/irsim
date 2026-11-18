'use client'

import { formatNumber } from '../lib/format-number'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { rectSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { Button, cn } from '../ui'
import { ChevronDown } from '../ui/icons'
import { Shell, Status } from './canvas'
import { CHROME_FORMAT } from './chrome-format'
import type { PageSummary } from './types'
import { GlobalSearch } from './global-search'
import { SettingsDialog } from './settings-dialog'
import { PageMenu, usePagesRefresh } from './page-menu'
import { GroupMenu, GroupTitle, NewGroupButton } from './page-group-controls'
import type { PageGroup } from './page-groups'
import {
  GroupSortable,
  PageGroupsDnd,
  PageList,
  useGroupItem,
  useLooseHeader,
  usePageItem,
} from './page-groups-dnd'
import { UpdateNotice } from './update-notice'
import { useApi } from './use-api'
import { usePageGroups } from './use-page-groups'
import { useLegacyRedirect } from './use-legacy-redirect'

/** `/`: one card per page of the canvas. */
export function PageIndex() {
  const [settings, setSettings] = useState(false)
  return (
    <Shell>
      <Index onOpenSettings={() => setSettings(true)} />
      <IndexSearch onOpenSettings={() => setSettings(true)} />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </Shell>
  )
}

function IndexSearch({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return <GlobalSearch open={open} onOpenChange={setOpen} onOpenSettings={onOpenSettings} />
}

function Index({ onOpenSettings }: { onOpenSettings: () => void }) {
  useLegacyRedirect(useSearchParams().get('board'))
  const pages = useApi<PageSummary[]>('/api/pages')
  usePagesRefresh(pages.refetch)
  if (pages.status !== 'ready') return <Status state={pages} missing="No canvas pages yet." />
  return <Groups pages={pages.data} onOpenSettings={onOpenSettings} />
}

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4'

function PageCard({ page, store }: { page: PageSummary; store: ReturnType<typeof usePageGroups> }) {
  const item = usePageItem(page.id)
  return (
    <li ref={item.setNodeRef} style={item.style} className="relative" {...item.listeners}>
      {item.marked ? (
        <span aria-hidden="true" className="absolute -start-2.25 top-0 bottom-0 w-0.5 bg-ring" />
      ) : null}
      <PageMenu
        page={page}
        store={store}
        iconSize={16}
        iconClassName="shrink-0"
        titleClassName="text-lg font-medium text-foreground"
      >
        {({ icon, title, renaming }) => (
          <div
            className={cn(
              'relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring',
              item.dragging && 'opacity-40',
            )}
          >
            <Link
              href={`/p/${encodeURIComponent(page.id)}`}
              aria-label={page.title}
              draggable={false}
              className="absolute inset-0 rounded-xl outline-none"
            />
            <span className="pointer-events-none flex items-center gap-2">
              <span className="pointer-events-auto relative inline-flex">{icon}</span>
              <span className={cn('relative min-w-0', renaming && 'pointer-events-auto')}>{title}</span>
            </span>
            <span className="pointer-events-none text-xs text-muted-foreground">
              {formatNumber(page.boardCount, CHROME_FORMAT)} {page.boardCount === 1 ? 'board' : 'boards'}
            </span>
            <span className="pointer-events-none flex flex-wrap gap-1.5">
              {page.boards.map((name) => (
                <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {name}
                </span>
              ))}
            </span>
          </div>
        )}
      </PageMenu>
    </li>
  )
}

const rowClass = 'mb-3 flex items-center gap-2 rounded-lg px-2 py-1'
const countClass = 'text-xs tabular-nums text-muted-foreground'
const highlight = 'bg-accent outline-1 outline-dashed outline-ring'

function Cards({
  ids,
  group,
  byId,
  store,
}: {
  ids: string[]
  group: string | null
  byId: Map<string, PageSummary>
  store: ReturnType<typeof usePageGroups>
}) {
  return (
    <PageList group={group} ids={ids} strategy={rectSortingStrategy} className={GRID} as="ul">
      {ids.map((id) => {
        const page = byId.get(id)
        return page ? <PageCard key={id} page={page} store={store} /> : null
      })}
    </PageList>
  )
}

function UngroupedHeader({ count }: { count: number }) {
  const header = useLooseHeader()
  return (
    <div ref={header.setNodeRef} className={cn(rowClass, header.highlighted && highlight)}>
      <span className="text-[13px] font-semibold text-foreground">Ungrouped</span>
      <span className={countClass}>{count}</span>
    </div>
  )
}

function GroupSection({
  group,
  byId,
  store,
}: {
  group: PageGroup
  byId: Map<string, PageSummary>
  store: ReturnType<typeof usePageGroups>
}) {
  const [renaming, setRenaming] = useState(false)
  const item = useGroupItem(group.id, renaming)
  return (
    <section ref={item.setNodeRef} style={item.style} className={cn('mb-6', item.dragging && 'opacity-40')}>
      <GroupMenu onRename={() => setRenaming(true)} onUngroup={() => store.ungroup(group.id)}>
        <div
          ref={item.setHeaderRef}
          {...item.listeners}
          className={cn(rowClass, !renaming && 'cursor-grab', item.highlighted && highlight)}
        >
          <button
            type="button"
            aria-expanded={!group.collapsed}
            aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
            onClick={() => store.toggle(group.id)}
            className="inline-flex size-6 items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn('transition-transform', group.collapsed && '-rotate-90')}
            />
          </button>
          <GroupTitle
            title={group.title}
            renaming={renaming}
            onRename={(title) => {
              store.rename(group.id, title)
              setRenaming(false)
            }}
            onCancel={() => setRenaming(false)}
            className="text-[13px] font-semibold text-foreground"
          />
          <span className={countClass}>{group.pages.length}</span>
        </div>
      </GroupMenu>
      {group.collapsed ? null : <Cards ids={group.pages} group={group.id} byId={byId} store={store} />}
    </section>
  )
}

function Groups({ pages, onOpenSettings }: { pages: PageSummary[]; onOpenSettings: () => void }) {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const store = usePageGroups(pages.map((page) => page.id))
  const { state } = store
  const grouped = state.groups.length > 0

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold">Pages</h1>
          <NewGroupButton onAdd={store.add} align="start" />
        </div>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onOpenSettings} className="h-8.5 px-3 text-[13px]">
          Settings
        </Button>
      </div>
      <UpdateNotice className="mb-6 max-w-sm" />
      <PageGroupsDnd store={store}>
        <GroupSortable groups={state.groups.map((group) => group.id)}>
          {state.groups.map((group) => (
            <GroupSection key={group.id} group={group} byId={byId} store={store} />
          ))}
        </GroupSortable>
        <section>
          {grouped ? <UngroupedHeader count={state.loose.length} /> : null}
          <Cards ids={state.loose} group={null} byId={byId} store={store} />
        </section>
      </PageGroupsDnd>
    </main>
  )
}
