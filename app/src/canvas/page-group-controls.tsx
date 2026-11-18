'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  cn,
} from '../ui'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/ui/popover'
import { EditIcon, Plus, Ungroup } from '../ui/icons'

export function NewGroupButton({
  onAdd,
  align,
}: {
  onAdd: (title: string) => void
  align: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const submit = () => {
    if (title.trim() === '') return
    onAdd(title)
    setTitle('')
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTitle('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="New group"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="ltr"
        lang="en"
        align={align}
        aria-label="New group"
        className="w-60 rounded-[10px] p-2"
      >
        <label htmlFor="new-group-name" className="mb-1 block text-xs text-muted-foreground">
          Group name
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="new-group-name"
            autoFocus
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
          <Button
            type="button"
            size="sm"
            disabled={title.trim() === ''}
            onClick={submit}
            className="h-8 px-3 text-[13px]"
          >
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function GroupMenu({
  children,
  onRename,
  onUngroup,
}: {
  children: ReactNode
  onRename: () => void
  onUngroup: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [last, setLast] = useState({ x: 0, y: 0 })
  const shown = menu ?? last
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
        {children}
      </div>
      <DropdownMenu dir="ltr" modal={false} open={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-0"
            style={{ left: shown.x, top: shown.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent lang="en" align="start" side="bottom" sideOffset={0} className="w-50">
          <DropdownMenuItem onSelect={onRename}>
            <EditIcon className="size-4" />
            Rename group
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onUngroup}>
            <Ungroup className="size-4" />
            Ungroup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export function GroupTitle({
  title,
  renaming,
  onRename,
  onCancel,
  className,
}: {
  title: string
  renaming: boolean
  onRename: (title: string) => void
  onCancel: () => void
  className?: string
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
    onRename(draft)
  }
  return (
    <input
      autoFocus
      dir="auto"
      aria-label="Group name"
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
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
