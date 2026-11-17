'use client'

import { Fragment, useMemo, useState } from 'react'
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
import { useSession } from './comments/use-session'
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

export function ContextMenu({
  menu,
  groups,
  onSelect,
  onClose,
}: {
  menu: { x: number; y: number } | null
  groups: (connected: boolean) => MenuItem[][]
  onSelect: (id: MenuItemId, sessionId: string | null) => void
  onClose: () => void
}) {
  const { sessionId } = useSession()
  const [last, setLast] = useState(menu)
  if (menu !== null && menu !== last) setLast(menu)
  const shown = menu ?? last
  const [kept, setKept] = useState<MenuItem[][]>([])
  const current = useMemo(() => (menu ? groups(sessionId !== null) : null), [menu, groups, sessionId])
  if (current !== null && current !== kept) setKept(current)
  return (
    <DropdownMenu dir="ltr" modal={false} open={menu !== null} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: shown?.x ?? 0, top: shown?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent lang="en" align="start" side="bottom" sideOffset={0} className="w-60">
        {kept.map((group, index) => (
          <Fragment key={group[0]?.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((item) => (
              <DropdownMenuItem
                key={item.id}
                variant={item.danger ? 'destructive' : 'default'}
                onSelect={() => onSelect(item.id, sessionId)}
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
