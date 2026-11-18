'use client'

import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic'
import { useMemo, useRef, useState } from 'react'
import { PopoverContent } from '../ui/components/ui/popover'
import { SearchIcon } from '../ui/icons'

const COMMON: IconName[] = [
  'house', 'user', 'users', 'settings', 'shopping-cart', 'heart', 'star', 'mail',
  'bell', 'search', 'calendar', 'camera', 'image', 'file-text', 'folder', 'lock',
  'globe', 'map-pin', 'message-circle', 'credit-card', 'chart-bar', 'package', 'phone', 'play',
  'rocket', 'bookmark', 'tag', 'wallet', 'zap', 'layout-dashboard', 'shield', 'store',
]
const MAX = 96
const COLUMNS = 8

const matches = (query: string): IconName[] => {
  const needle = query.trim().toLowerCase().replace(/-/g, ' ')
  if (needle === '') return COMMON.filter((name) => iconNames.includes(name))
  return iconNames.filter((name) => name.replace(/-/g, ' ').includes(needle))
}

export function IconPickerContent({
  selected,
  onPick,
  align = 'start',
}: {
  selected: string | undefined
  onPick: (name: string | null) => void
  align?: 'start' | 'center' | 'end'
}) {
  const [query, setQuery] = useState('')
  const grid = useRef<HTMLDivElement>(null)
  const found = useMemo(() => matches(query), [query])
  const shown = found.slice(0, MAX)
  const total = query.trim() === '' ? iconNames.length : found.length
  const count =
    query.trim() === ''
      ? `${total.toLocaleString('en')} icons`
      : `${total.toLocaleString('en')} ${total === 1 ? 'match' : 'matches'}`

  const focusAt = (index: number) => {
    const buttons = grid.current?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[Math.max(0, Math.min(index, buttons.length - 1))]?.focus()
  }
  const onGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    }
    const delta = step[event.key]
    if (delta === undefined) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && at < COLUMNS) {
      ;(document.getElementById('icon-picker-search') as HTMLInputElement | null)?.focus()
      return
    }
    focusAt(at + delta)
  }

  return (
    <PopoverContent
      dir="ltr"
      lang="en"
      align={align}
      aria-label="Choose icon"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      className="flex w-72 flex-col gap-2 rounded-xl p-3"
    >
      <div className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5 text-muted-foreground focus-within:border-ring">
        <SearchIcon size={16} aria-hidden="true" />
        <input
          id="icon-picker-search"
          autoFocus
          value={query}
          placeholder="Search icons"
          aria-label="Search icons"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusAt(0)
            } else if (event.key === 'Enter' && shown[0]) {
              event.preventDefault()
              onPick(shown[0])
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {shown.length > 0 ? (
        <div
          ref={grid}
          onKeyDown={onGridKey}
          className="grid max-h-60 grid-cols-[repeat(8,32px)] auto-rows-[32px] overflow-y-auto"
        >
          {shown.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={name === selected}
              onClick={() => onPick(name)}
              className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 p-0 text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${
                name === selected ? 'bg-accent ring-2 ring-ring' : 'bg-transparent'
              }`}
            >
              <DynamicIcon name={name} size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          No icons match
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border pt-1">
        <button
          type="button"
          onClick={() => onPick(null)}
          className="mt-1 h-7 cursor-pointer rounded-md border-0 bg-transparent px-2 text-[13px] text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          Default
        </button>
        <span className="mt-1 text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
    </PopoverContent>
  )
}
