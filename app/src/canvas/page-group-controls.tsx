'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '../ui'
import { EditIcon, Ungroup } from '../ui/icons'

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
