'use client'

import { useState } from 'react'
import { Button, Input } from '../ui'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/ui/popover'
import { IconPickerContent } from './icon-picker'
import { stop } from './page-menu'

export type PagePopover = { kind: 'rename' | 'icon'; x: number; y: number }

function RenameField({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(title)
  const submit = () => {
    if (draft.trim() !== '') onSave(draft.trim())
  }
  return (
    <>
      <label htmlFor="canvas-page-name" className="mb-1 block text-xs text-muted-foreground">
        Page name
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="canvas-page-name"
          autoFocus
          dir="auto"
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[13px]"
        />
        <Button type="button" size="sm" disabled={draft.trim() === ''} onClick={submit} className="h-8 px-3 text-[13px]">
          Save
        </Button>
      </div>
    </>
  )
}

/** The page rename field and the icon picker, opened at the pointer from the canvas menu. */
export function PagePopovers({
  popover,
  title,
  icon,
  onRename,
  onPick,
  onClose,
}: {
  popover: PagePopover | null
  title: string
  icon: string | undefined
  onRename: (title: string) => void
  onPick: (icon: string | null) => void
  onClose: () => void
}) {
  const [last, setLast] = useState<PagePopover | null>(popover)
  if (popover !== null && popover !== last) setLast(popover)
  const shown = popover ?? last
  return (
    <Popover open={popover !== null} onOpenChange={(open) => !open && onClose()}>
      <PopoverTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: shown?.x ?? 0, top: shown?.y ?? 0 }}
        />
      </PopoverTrigger>
      {popover?.kind === 'rename' ? (
        <PopoverContent
          dir="ltr"
          lang="en"
          align="start"
          sideOffset={0}
          aria-label="Rename page"
          className="w-60 rounded-[10px] p-2"
          {...stop}
        >
          <RenameField title={title} onSave={onRename} />
        </PopoverContent>
      ) : null}
      {popover?.kind === 'icon' ? <IconPickerContent selected={icon} onPick={onPick} /> : null}
    </Popover>
  )
}
