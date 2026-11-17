'use client'

import { Fragment } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui'
import {
  Check,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  LogOut,
  MessageSquare,
  PanelTop,
  Play,
  SquareSquare,
} from '../ui/icons'
import { SplitIcon } from '../ui/icons-custom'
import type { MenuItem, MenuItemId } from './context-menu-model'

const ICON = 'size-4'

const ICONS: Record<MenuItemId, React.ReactNode> = {
  copy: <CopyIcon className={ICON} />,
  play: <Play className={ICON} />,
  comment: <MessageSquare className={ICON} />,
  variants: <SplitIcon size={16} className={ICON} />,
  approve: <Check className={ICON} />,
  'create-section': <PanelTop className={ICON} />,
  'create-sub-section': <SquareSquare className={ICON} />,
  'remove-from-section': <LogOut className={ICON} />,
  'rename-section': <EditIcon className={ICON} />,
  'delete-section': <DeleteIcon className={ICON} />,
}

export type ContextMenuState = { x: number; y: number; groups: MenuItem[][] }

/** The right click menu of the canvas, opened at a screen point. */
export function ContextMenu({
  menu,
  onSelect,
  onClose,
}: {
  menu: ContextMenuState | null
  onSelect: (id: MenuItemId) => void
  onClose: () => void
}) {
  return (
    <DropdownMenu dir="ltr" open={menu !== null} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent lang="en" align="start" side="bottom" sideOffset={0} className="w-60">
        {menu?.groups.map((group, index) => (
          <Fragment key={group[0]?.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((item) => (
              <DropdownMenuItem
                key={item.id}
                variant={item.danger ? 'destructive' : 'default'}
                onSelect={() => onSelect(item.id)}
              >
                {ICONS[item.id]}
                {item.label}
                {item.shortcut ? (
                  <span className="ms-auto text-xs text-muted-foreground">{item.shortcut}</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
