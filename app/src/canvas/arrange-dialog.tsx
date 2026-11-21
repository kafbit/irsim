'use client'

import { useRef, useState } from 'react'
import { Button, cn, Input } from '../ui'
import { Columns3, Grid3x3, Rows3, WrapText } from '../ui/icons'
import type { TidyMode } from './tidy'
import { useMountEffect } from './use-mount-effect'
import { arrangeRequest, DEFAULT_GAP, gridDefaults, type TidyRequest } from './tidy-section'

const MODES: { mode: TidyMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'row', label: 'Row', icon: <Columns3 className="size-5" aria-hidden="true" /> },
  { mode: 'column', label: 'Column', icon: <Rows3 className="size-5" aria-hidden="true" /> },
  { mode: 'wrap', label: 'Wrap', icon: <WrapText className="size-5" aria-hidden="true" /> },
  { mode: 'grid', label: 'Grid', icon: <Grid3x3 className="size-5" aria-hidden="true" /> },
]

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: number
  max: number
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] rounded-[10px] px-2.5 text-sm text-foreground"
      />
    </label>
  )
}

function ArrangePanel({
  count,
  gap: initialGap,
  initialMode,
  onClose,
  onArrange,
}: {
  count: number
  gap: number
  initialMode: TidyMode
  onClose: () => void
  onArrange: (request: TidyRequest) => void
}) {
  const defaults = gridDefaults(count)
  const [mode, setMode] = useState<TidyMode>(initialMode)
  const [gap, setGap] = useState(String(initialGap))
  const [columns, setColumns] = useState(String(defaults.columns))
  const [rows, setRows] = useState(String(defaults.rows))
  const [width, setWidth] = useState('1200')
  const limit = Math.max(1, count)
  const dialog = useRef<HTMLDivElement>(null)
  useMountEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  })
  const editColumns = (value: string) => {
    setColumns(value)
    const next = Math.round(Number(value))
    if (next > 0) setRows(String(Math.ceil(limit / Math.min(limit, next))))
  }
  const editRows = (value: string) => {
    setRows(value)
    const next = Math.round(Number(value))
    if (next > 0) setColumns(String(Math.ceil(limit / Math.min(limit, next))))
  }
  const apply = () => {
    onArrange(arrangeRequest(mode, { gap, columns, rows, width }, count))
    onClose()
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'color-mix(in srgb, var(--foreground) 32%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Arrange boards"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
        }}
        className="flex w-[360px] max-w-full flex-col gap-4 rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
      >
        <header className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold">Arrange boards</h2>
          <p className="m-0 text-sm text-muted-foreground">Re-lay the boards of this section.</p>
        </header>
        <div role="radiogroup" aria-label="Layout" className="grid grid-cols-4 gap-2">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={option.mode === mode}
              onClick={() => setMode(option.mode)}
              className={cn(
                'flex h-16 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border p-0 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                option.mode === mode ? 'border-primary bg-accent' : 'border-border bg-transparent',
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
        <NumberField label="Gap" value={gap} min={0} max={400} onChange={setGap} />
        {mode === 'grid' ? (
          <div className="flex items-end gap-2">
            <NumberField label="Columns" value={columns} min={1} max={limit} onChange={editColumns} />
            <span className="pb-2 text-sm text-muted-foreground">×</span>
            <NumberField label="Rows" value={rows} min={1} max={limit} onChange={editRows} />
          </div>
        ) : null}
        {mode === 'wrap' ? (
          <NumberField label="Width" value={width} min={120} max={20000} onChange={setWidth} />
        ) : null}
        <footer className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply}>
            Arrange
          </Button>
        </footer>
      </div>
    </div>
  )
}

/** The Arrange boards modal: a layout, the gap, Columns and Rows for Grid, Width for Wrap. `count` is the boards the section holds itself. */
export function ArrangeDialog({
  open,
  onClose,
  onArrange,
  initialMode = 'row',
  count = 4,
  gap = DEFAULT_GAP,
}: {
  open: boolean
  onClose: () => void
  onArrange: (request: TidyRequest) => void
  initialMode?: TidyMode
  count?: number
  gap?: number
}) {
  if (!open) return null
  return (
    <ArrangePanel
      count={count}
      gap={gap}
      initialMode={initialMode}
      onClose={onClose}
      onArrange={onArrange}
    />
  )
}
