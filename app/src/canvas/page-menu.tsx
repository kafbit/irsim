'use client'

import { DropdownMenu as Radix } from 'radix-ui'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
} from '../ui'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/ui/popover'
import {
  ArrowUpRight,
  ChevronRight,
  CopyIcon,
  EditIcon,
  ExternalLink,
  FolderInput,
  LinkIcon,
  SmilePlus,
  Sparkles,
} from '../ui/icons'
import { PageIcon } from '../ui/page-icon'
import { useSession } from './comments/use-session'
import { IconPickerContent } from './icon-picker'
import { sendPageRequest } from './page-requests'
import type { usePageGroups } from './use-page-groups'
import { Toast, useNotice } from './toast'
import { useEvents } from './comments/use-events'
import type { PageSummary } from './types'

const PAGES_CHANGED = 'canvas:pages-changed'

export function usePagesRefresh(refetch: () => void) {
  useEvents({ onBoard: () => {}, onComments: () => {}, onCanvas: refetch })
  useEffect(() => {
    window.addEventListener(PAGES_CHANGED, refetch)
    return () => window.removeEventListener(PAGES_CHANGED, refetch)
  }, [refetch])
}

export async function patchPage(body: { page: string; title?: string; icon?: string | null }) {
  const response = await fetch('/api/canvas', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not save the page.')
  }
  window.dispatchEvent(new Event(PAGES_CHANGED))
}

export const itemClass =
  "relative flex min-h-9.5 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 data-[state=open]:bg-accent [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0"
export const surfaceClass =
  'z-50 min-w-50 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg'

export const stop = {
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  onKeyDown: (event: React.KeyboardEvent) => event.stopPropagation(),
  onClick: (event: React.MouseEvent) => event.stopPropagation(),
}

export type PageMenuApi = {
  renaming: boolean
  icon: ReactNode
  title: ReactNode
}

export function PageMenu({
  page,
  store,
  iconSize,
  iconClassName,
  titleClassName,
  children,
}: {
  page: PageSummary
  store: ReturnType<typeof usePageGroups>
  iconSize: number
  iconClassName?: string | undefined
  titleClassName?: string | undefined
  children: (api: PageMenuApi) => ReactNode
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [last, setLast] = useState({ x: 0, y: 0 })
  const [renaming, setRenaming] = useState(false)
  const [picker, setPicker] = useState(false)
  const [naming, setNaming] = useState(false)
  const [notice, showNotice] = useNotice()
  const afterClose = useRef<(() => void) | null>(null)
  const pending = useRef<string | null>(null)
  const shown = menu ?? last

  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(error)
    showNotice(message)
  }

  const saveTitle = (value: string) => {
    setRenaming(false)
    const title = value.trim()
    if (title === '') return showNotice('The page name cannot be empty.')
    if (title === page.title) return
    patchPage({ page: page.id, title }).catch(fail)
  }

  const pickIcon = (name: string | null) => {
    setPicker(false)
    patchPage({ page: page.id, icon: name }).catch(fail)
  }

  const createGroup = (title: string) => {
    pending.current = title.trim()
    store.add(title)
  }
  const groups = store.state.groups
  const { movePage } = store
  useEffect(() => {
    if (pending.current === null) return
    const created = [...groups].reverse().find((group) => group.title === pending.current)
    if (!created) return
    pending.current = null
    movePage(page.id, { group: created.id, before: null })
  }, [groups, movePage, page.id])

  const icon = (
    <Popover open={picker} onOpenChange={setPicker}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change icon"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setPicker((open) => !open)
          }}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <PageIcon icon={page.icon} size={iconSize} className={iconClassName} />
        </button>
      </PopoverTrigger>
      {picker ? <IconPickerContent selected={page.icon} onPick={pickIcon} /> : null}
    </Popover>
  )

  const title = (
    <PageTitleField
      title={page.title}
      renaming={renaming}
      onSave={saveTitle}
      onCancel={() => setRenaming(false)}
      className={titleClassName}
    />
  )

  return (
    <>
      <div
        className="contents"
        onContextMenu={(event) => {
          event.preventDefault()
          const point = { x: event.clientX, y: event.clientY }
          setLast(point)
          setMenu(point)
        }}
      >
        {children({ renaming, icon, title })}
      </div>
      <DropdownMenu dir="ltr" modal={false} open={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-0"
            style={{ left: shown.x, top: shown.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          lang="en"
          align="start"
          side="bottom"
          sideOffset={0}
          aria-label="Page actions"
          className="w-67"
          onCloseAutoFocus={(event) => {
            const run = afterClose.current
            if (!run) return
            event.preventDefault()
            afterClose.current = null
            run()
          }}
          {...stop}
        >
          <PageMenuItems
            page={page}
            groups={groups}
            onMove={(group) => movePage(page.id, { group, before: null })}
            onNewGroup={() => {
              afterClose.current = () => setNaming(true)
            }}
            onRename={() => {
              afterClose.current = () => setRenaming(true)
            }}
            onChangeIcon={() => {
              afterClose.current = () => setPicker(true)
            }}
            onNotice={showNotice}
            onFail={fail}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={naming} onOpenChange={setNaming}>
        <PopoverTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-0"
            style={{ left: shown.x, top: shown.y }}
          />
        </PopoverTrigger>
        <PopoverContent
          dir="ltr"
          lang="en"
          align="start"
          sideOffset={0}
          aria-label="New group"
          className="w-60 rounded-[10px] p-2"
          {...stop}
        >
          <NewGroupName
            onAdd={(value) => {
              createGroup(value)
              setNaming(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {notice
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-50">
              <Toast message={notice.message} tone={notice.tone} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function NewGroupName({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  const submit = () => {
    if (title.trim() !== '') onAdd(title)
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        aria-label="Group name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[13px]"
      />
      <Button type="button" size="sm" disabled={title.trim() === ''} onClick={submit} className="h-8 px-3 text-[13px]">
        Add
      </Button>
    </div>
  )
}

function PageMenuItems({
  page,
  groups,
  onMove,
  onNewGroup,
  onRename,
  onChangeIcon,
  onNotice,
  onFail,
}: {
  page: PageSummary
  groups: ReturnType<typeof usePageGroups>['state']['groups']
  onMove: (group: string | null) => void
  onNewGroup: () => void
  onRename: () => void
  onChangeIcon: () => void
  onNotice: (message: string, tone: 'info') => void
  onFail: (error: unknown) => void
}) {
  const router = useRouter()
  const { sessionId } = useSession()
  const href = `/p/${encodeURIComponent(page.id)}`
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(onFail)
  }
  const current = groups.find((group) => group.pages.includes(page.id))?.id ?? null
  return (
    <>
      <DropdownMenuItem onSelect={() => router.push(href)}>
        <ArrowUpRight />
        Open
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => window.open(href, '_blank', 'noopener')}>
        <ExternalLink />
        Open in new tab
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => copy(page.title)}>
        <CopyIcon />
        Copy page name
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => copy(`${window.location.origin}${href}`)}>
        <LinkIcon />
        Copy page link
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onRename}>
        <EditIcon />
        Rename page
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onChangeIcon}>
        <SmilePlus />
        Change icon…
      </DropdownMenuItem>
      <Radix.Sub>
        <Radix.SubTrigger className={itemClass}>
          <FolderInput />
          <span className="flex-1">Move to group</span>
          <ChevronRight />
        </Radix.SubTrigger>
        <Radix.Portal>
          <Radix.SubContent lang="en" sideOffset={4} className={cn(surfaceClass, 'w-50')} {...stop}>
            {groups.map((group) => (
              <Radix.Item
                key={group.id}
                disabled={group.id === current}
                onSelect={() => onMove(group.id)}
                className={itemClass}
              >
                <span dir="auto" className="truncate">
                  {group.title}
                </span>
              </Radix.Item>
            ))}
            <Radix.Item disabled={current === null} onSelect={() => onMove(null)} className={itemClass}>
              Ungrouped
            </Radix.Item>
            <Radix.Separator className="mx-1 my-1.5 h-px bg-muted" />
            <Radix.Item onSelect={onNewGroup} className={itemClass}>
              New group…
            </Radix.Item>
          </Radix.SubContent>
        </Radix.Portal>
      </Radix.Sub>
      {sessionId ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              sendPageRequest({ page: page.id, kind: 'icon', sessionId })
                .then(() => onNotice('Asked the agent to choose an icon', 'info'))
                .catch(onFail)
            }}
          >
            <Sparkles />
            Choose icon with agent
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}

function PageTitleField({
  title,
  renaming,
  onSave,
  onCancel,
  className,
}: {
  title: string
  renaming: boolean
  onSave: (title: string) => void
  onCancel: () => void
  className?: string | undefined
}) {
  const [draft, setDraft] = useState(title)
  const done = useRef(false)
  useEffect(() => {
    if (renaming) {
      setDraft(title)
      done.current = false
    }
  }, [renaming, title])
  if (!renaming) {
    return (
      <span dir="auto" className={className}>
        {title}
      </span>
    )
  }
  const save = () => {
    if (done.current) return
    done.current = true
    onSave(draft)
  }
  return (
    <input
      autoFocus
      dir="auto"
      aria-label="Page name"
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          done.current = true
          onCancel()
        }
      }}
      className={cn(
        'min-w-0 rounded-md border border-input bg-card px-1.5 outline-none focus-visible:border-ring',
        className,
      )}
    />
  )
}
