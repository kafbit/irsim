'use client'

import { Fragment, useMemo, useState } from 'react'
import { DropdownMenu as Radix } from 'radix-ui'
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui'
import {
  BoxSelect,
  ChevronRight,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  LayoutDashboard,
  LayoutGrid,
  LinkIcon,
  LocateFixed,
  LogOut,
  Maximize,
  MessageSquare,
  PanelLeft,
  PanelTop,
  Play,
  Scan,
  SmilePlus,
  Sparkles,
  SquareSquare,
} from '../ui/icons'
import { SplitIcon } from '../ui/icons-custom'
import { useSession } from './comments/use-session'
import type { MenuItem, MenuItemId } from './context-menu-model'
import { itemClass, stop, surfaceClass } from './page-menu'

const ICON = 'size-4'

const ICONS: Record<MenuItemId, React.ReactNode> = {
  'ask-agent': <Sparkles className={ICON} />,
  copy: <CopyIcon className={ICON} />,
  'copy-name': <CopyIcon className={ICON} />,
  play: <Play className={ICON} />,
  comment: <MessageSquare className={ICON} />,
  variants: <SplitIcon size={16} className={ICON} />,
  section: <PanelTop className={ICON} />,
  'create-section': <PanelTop className={ICON} />,
  'create-sub-section': <SquareSquare className={ICON} />,
  'remove-from-section': <LogOut className={ICON} />,
  'rename-section': <EditIcon className={ICON} />,
  'delete-section': <DeleteIcon className={ICON} />,
  'show-on-canvas': <LocateFixed className={ICON} />,
  arrange: <LayoutDashboard className={ICON} />,
  page: <EditIcon className={ICON} />,
  view: <Maximize className={ICON} />,
  'copy-page-name': <CopyIcon className={ICON} />,
  'copy-page-link': <LinkIcon className={ICON} />,
  'select-all': <BoxSelect className={ICON} />,
  'zoom-fit': <Maximize className={ICON} />,
  'zoom-100': <Scan className={ICON} />,
  'toggle-sidebar': <PanelLeft className={ICON} />,
  'rename-page': <EditIcon className={ICON} />,
  'change-icon': <SmilePlus className={ICON} />,
  reorganize: <LayoutGrid className={ICON} />,
  'choose-icon': <Sparkles className={ICON} />,
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
            {group.map((item) =>
              item.children ? (
                <Radix.Sub key={item.id}>
                  <Radix.SubTrigger className={itemClass}>
                    {ICONS[item.id]}
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight />
                  </Radix.SubTrigger>
                  <Radix.Portal>
                    <Radix.SubContent
                      lang="en"
                      sideOffset={4}
                      aria-label={item.label}
                      className={cn(surfaceClass, 'w-60')}
                      {...stop}
                    >
                      {item.children.map((child) => (
                        <Radix.Item
                          key={child.id}
                          disabled={child.disabled}
                          onSelect={() => onSelect(child.id, sessionId)}
                          className={cn(itemClass, child.danger && 'text-destructive')}
                        >
                          {ICONS[child.id]}
                          <span className="flex-1">{child.label}</span>
                          {child.shortcut ? (
                            <span className="ms-auto text-xs text-muted-foreground">{child.shortcut}</span>
                          ) : null}
                        </Radix.Item>
                      ))}
                    </Radix.SubContent>
                  </Radix.Portal>
                </Radix.Sub>
              ) : (
                <DropdownMenuItem
                  key={item.id}
                  variant={item.danger ? 'destructive' : 'default'}
                  disabled={item.disabled}
                  onSelect={() => onSelect(item.id, sessionId)}
                >
                  {ICONS[item.id]}
                  {item.label}
                  {item.shortcut ? (
                    <span className="ms-auto text-xs text-muted-foreground">{item.shortcut}</span>
                  ) : null}
                </DropdownMenuItem>
              ),
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
