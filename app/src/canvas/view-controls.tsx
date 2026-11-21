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
import { ChevronDown, MapIcon } from '../ui/icons'
import type { ReactNode } from 'react'
import type { Camera } from './camera'
import type { Layout, Rect } from './geometry'
import { Minimap } from './minimap'
import { useTheme } from './use-theme'

type Actions = {
  zoomTo: (k: number) => void
  zoomStep: (direction: 1 | -1) => void
  fit: () => void
}

function Item({
  onSelect,
  keys,
  children,
}: {
  onSelect: () => void
  keys?: string
  children: ReactNode
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      {children}
      {keys ? <span className="ms-auto ps-6 text-xs text-muted-foreground">{keys}</span> : null}
    </DropdownMenuItem>
  )
}

/** Bottom end corner: the minimap above, then the minimap toggle and the zoom menu. */
export function ViewControls({
  camera,
  layout,
  sections,
  k,
  actions,
  selected,
  onFitSelection,
  minimap,
  onToggleMinimap,
}: {
  camera: Camera
  layout: Layout
  sections: Rect[]
  k: number
  actions: Actions
  selected: string[]
  onFitSelection: () => void
  minimap: boolean
  onToggleMinimap: () => void
}) {
  const { theme, toggle: toggleTheme } = useTheme()
  return (
    <div
      className="absolute end-4 bottom-4 flex flex-col items-end gap-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {minimap ? <Minimap camera={camera} layout={layout} sections={sections} selected={selected} /> : null}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-[0_14px_36px_rgba(20,22,26,0.14)]">
        <IconButton
          label={minimap ? 'Hide minimap' : 'Show minimap'}
          icon={<MapIcon className="size-4" />}
          aria-pressed={minimap}
          className={minimap ? 'bg-secondary text-foreground' : ''}
          onClick={onToggleMinimap}
        />
        <DropdownMenu dir="ltr">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Zoom menu" className="tabular-nums">
              {Math.round(k * 100)}%
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent lang="en" align="end" side="top" className="min-w-48">
            <Item onSelect={() => actions.zoomStep(1)} keys="+">
              Zoom in
            </Item>
            <Item onSelect={() => actions.zoomStep(-1)} keys="-">
              Zoom out
            </Item>
            <DropdownMenuSeparator />
            <Item onSelect={() => actions.zoomTo(0.5)}>Zoom to 50%</Item>
            <Item onSelect={() => actions.zoomTo(1)} keys="Shift+0">
              Zoom to 100%
            </Item>
            <Item onSelect={() => actions.zoomTo(2)}>Zoom to 200%</Item>
            <DropdownMenuSeparator />
            <Item onSelect={actions.fit} keys="Shift+1">
              Fit page
            </Item>
            <DropdownMenuItem disabled={selected.length === 0} onSelect={onFitSelection}>
              Fit selection
              <span className="ms-auto ps-6 text-xs text-muted-foreground">Shift+2</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Item onSelect={toggleTheme}>
              {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            </Item>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
