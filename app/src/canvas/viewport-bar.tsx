'use client'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '../ui'
import { Check, ChevronDown, Monitor, RotateIcon } from '../ui/icons'
import { FIELD_EDGE } from '../ui/input'
import { cn } from '../ui/cn'
import { DEVICE_PRESETS, presetLabel } from '../lib/view-label'
import { clampSide, type PresetId, type ViewportState, type ZoomMode } from './viewport'

type Entry = { id: PresetId; label: string; hint: string }

const size = (width: number, height: number) => `${width} × ${height}`

const ZOOMS: { id: ZoomMode; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: '100%' },
  { id: 'fit-width', label: 'Fit width', hint: 'Fills the width' },
  { id: 'contain', label: 'Contain', hint: 'Shows it all' },
]

const DEVICES: Entry[] = DEVICE_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  hint: size(preset.width, preset.height),
}))

function SideInput({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}) {
  return (
    <input
      key={value}
      type="text"
      inputMode="numeric"
      aria-label={label}
      defaultValue={value}
      className={cn(
        FIELD_EDGE,
        'h-8 w-14 px-1 text-center text-[13px] text-foreground tabular-nums',
      )}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.currentTarget.blur()
      }}
      onBlur={(event) => {
        const typed = Number.parseInt(event.currentTarget.value, 10)
        if (!Number.isFinite(typed)) {
          event.currentTarget.value = String(value)
          return
        }
        const next = clampSide(typed)
        event.currentTarget.value = String(next)
        if (next !== value) onCommit(next)
      }}
    />
  )
}

/** The Play header's centre: a preset menu, the width and height fields, rotate and the scale readout. */
export function ViewportBar({
  state,
  scale,
  zoom,
  zoomDisabled = false,
  boardSize,
  onPreset,
  onSize,
  onRotate,
  onZoom,
}: {
  state: ViewportState
  scale: number
  zoom: ZoomMode
  zoomDisabled?: boolean
  boardSize?: { width: number; height: number }
  onPreset: (id: PresetId) => void
  onSize: (width: number, height: number) => void
  onRotate: () => void
  onZoom: (mode: ZoomMode) => void
}) {
  const row = (entry: Entry) => (
    <DropdownMenuItem
      key={entry.id}
      role="menuitemradio"
      aria-checked={state.preset === entry.id}
      className="min-h-8 gap-2 px-2 text-[13px]"
      onSelect={() => onPreset(entry.id)}
    >
      <span className="inline-flex w-3.5 shrink-0">
        {state.preset === entry.id ? <Check className="size-3.5" /> : null}
      </span>
      <span className="flex-1">{entry.label}</span>
      {entry.hint ? (
        <span className="text-xs text-muted-foreground tabular-nums">{entry.hint}</span>
      ) : null}
    </DropdownMenuItem>
  )

  return (
    <div role="toolbar" aria-label="Viewport" className="flex items-center gap-2">
      <DropdownMenu dir="ltr">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Viewport preset"
            icon={<Monitor className="size-3.5" />}
            className="border-border-strong aria-expanded:bg-secondary"
          >
            {presetLabel(state.preset)}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          lang="en"
          align="center"
          aria-label="Viewport presets"
          className="w-62 p-1"
        >
          {row({ id: 'fit', label: 'Fit window', hint: '' })}
          <DropdownMenuSeparator className="my-1 mx-0 bg-border" />
          {DEVICES.map(row)}
          <DropdownMenuSeparator className="my-1 mx-0 bg-border" />
          {row({
            id: 'board',
            label: 'Board size',
            hint: boardSize ? size(boardSize.width, boardSize.height) : '',
          })}
          {row({ id: 'responsive', label: 'Responsive', hint: 'Drag edges' })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <SideInput
          label="Width"
          value={state.width}
          onCommit={(width) => onSize(width, state.height)}
        />
        ×
        <SideInput
          label="Height"
          value={state.height}
          onCommit={(height) => onSize(state.width, height)}
        />
      </div>
      <IconButton
        label="Rotate"
        icon={<RotateIcon className="size-4" />}
        disabled={state.preset === 'fit'}
        onClick={onRotate}
        className="size-8"
      />
      <DropdownMenu dir="ltr">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom"
            disabled={zoomDisabled}
            className="text-muted-foreground tabular-nums aria-expanded:bg-secondary"
          >
            {`${Math.round(scale * 100)}%`}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent lang="en" align="end" aria-label="Zoom" className="w-62 p-1">
          {ZOOMS.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              role="menuitemradio"
              aria-checked={zoom === entry.id}
              className="min-h-8 gap-2 px-2 text-[13px]"
              onSelect={() => onZoom(entry.id)}
            >
              <span className="inline-flex w-3.5 shrink-0">
                {zoom === entry.id ? <Check className="size-3.5" /> : null}
              </span>
              <span className="flex-1">{entry.label}</span>
              <span className="text-xs text-muted-foreground">{entry.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
