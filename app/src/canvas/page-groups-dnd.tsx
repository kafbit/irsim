'use client'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy as verticalStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import type { PageGroups, PageTarget } from './page-groups'

const LOOSE = 'loose'
const pageKey = (id: string) => `page:${id}`
const groupKey = (id: string) => `group:${id}`
const headerKey = (id: string | null) => `header:${id ?? LOOSE}`
const listKey = (id: string | null) => `list:${id ?? LOOSE}`

const strip = (key: string, prefix: string) => key.slice(prefix.length)
const owner = (key: string) => (key === LOOSE ? null : key)

type Store = {
  state: PageGroups
  movePage: (pageId: string, target: PageTarget) => void
  moveGroup: (groupId: string, before: string | null) => void
}

type Active = { kind: 'page' | 'group'; id: string }

const DndState = createContext<{ active: Active | null; over: string | null }>({
  active: null,
  over: null,
})

const parse = (key: unknown): Active | null => {
  if (typeof key !== 'string') return null
  if (key.startsWith('page:')) return { kind: 'page', id: strip(key, 'page:') }
  if (key.startsWith('group:')) return { kind: 'group', id: strip(key, 'group:') }
  return null
}

const collide: CollisionDetection = (args) => {
  const kind = parse(args.active.id)?.kind
  const wanted = (id: string) =>
    kind === 'group' ? id.startsWith('group:') : !id.startsWith('group:')
  const droppableContainers = args.droppableContainers.filter((container) =>
    wanted(String(container.id)),
  )
  const scoped = { ...args, droppableContainers }
  const within = pointerWithin(scoped)
  const hits = within.length > 0 ? within : closestCenter(scoped)
  const specific = hits.filter((hit) => !String(hit.id).startsWith('list:'))
  return specific.length > 0 ? specific : hits
}

const sameList = (state: PageGroups, a: string, b: string) => {
  const find = (id: string) =>
    state.groups.find((group) => group.pages.includes(id))?.id ?? (state.loose.includes(id) ? null : undefined)
  const left = find(a)
  return left !== undefined && left === find(b)
}

const listOf = (state: PageGroups, pageId: string): string[] =>
  state.groups.find((group) => group.pages.includes(pageId))?.pages ??
  (state.loose.includes(pageId) ? state.loose : [])

const resolvePage = (state: PageGroups, pageId: string, overKey: string): PageTarget | null => {
  if (overKey.startsWith('page:')) {
    const over = strip(overKey, 'page:')
    if (over === pageId) return null
    const group = state.groups.find((item) => item.pages.includes(over))?.id ?? null
    const list = listOf(state, over)
    if (sameList(state, pageId, over)) {
      const from = list.indexOf(pageId)
      const to = list.indexOf(over)
      if (from < to) return { group, before: list[to + 1] ?? null }
    }
    return { group, before: over }
  }
  if (overKey.startsWith('header:')) return { group: owner(strip(overKey, 'header:')), before: null }
  if (overKey.startsWith('list:')) return { group: owner(strip(overKey, 'list:')), before: null }
  return null
}

export function PageGroupsDnd({ store, children }: { store: Store; children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
  const reset = () => {
    setActive(null)
    setOver(null)
  }
  const onDragStart = (event: DragStartEvent) => setActive(parse(event.active.id))
  const onDragOver = (event: DragOverEvent) => setOver(event.over ? String(event.over.id) : null)
  const onDragEnd = (event: DragEndEvent) => {
    const from = parse(event.active.id)
    const target = event.over ? String(event.over.id) : null
    reset()
    if (!from || !target) return
    if (from.kind === 'page') {
      const resolved = resolvePage(store.state, from.id, target)
      if (resolved) store.movePage(from.id, resolved)
      return
    }
    const over = parse(target)
    if (!over || over.kind !== 'group' || over.id === from.id) return
    const ids = store.state.groups.map((group) => group.id)
    const fromIndex = ids.indexOf(from.id)
    const toIndex = ids.indexOf(over.id)
    store.moveGroup(from.id, fromIndex < toIndex ? (ids[toIndex + 1] ?? null) : over.id)
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <DndState.Provider value={{ active, over }}>{children}</DndState.Provider>
    </DndContext>
  )
}

export function PageList({
  group,
  ids,
  strategy,
  className,
  children,
  as: Tag = 'div',
}: {
  group: string | null
  ids: string[]
  strategy: SortingStrategy
  className?: string
  children: ReactNode
  as?: 'div' | 'ul'
}) {
  const { setNodeRef } = useDroppable({ id: listKey(group) })
  return (
    <SortableContext items={ids.map(pageKey)} strategy={strategy}>
      <Tag ref={setNodeRef as Ref<never>} className={className}>
        {children}
      </Tag>
    </SortableContext>
  )
}

export function usePageItem(pageId: string) {
  const sortable = useSortable({ id: pageKey(pageId) })
  const { active, over } = useContext(DndState)
  const style: CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 10 : undefined,
  }
  const crossing =
    active?.kind === 'page' && over === pageKey(pageId) && active.id !== pageId && !sortable.isDragging
  return {
    setNodeRef: sortable.setNodeRef,
    listeners: sortable.listeners,
    style,
    dragging: sortable.isDragging,
    marked: crossing,
  }
}

export function useGroupItem(groupId: string, disabled: boolean) {
  const sortable = useSortable({ id: groupKey(groupId), disabled })
  const drop = useDroppable({ id: headerKey(groupId) })
  const { active, over } = useContext(DndState)
  const setHeaderRef = useCallback(
    (node: HTMLElement | null) => {
      sortable.setActivatorNodeRef(node)
      drop.setNodeRef(node)
    },
    [sortable.setActivatorNodeRef, drop.setNodeRef],
  )
  return {
    setNodeRef: sortable.setNodeRef,
    setHeaderRef,
    listeners: sortable.listeners,
    style: {
      transform: CSS.Translate.toString(sortable.transform),
      transition: sortable.transition,
    } satisfies CSSProperties,
    dragging: sortable.isDragging,
    highlighted: active?.kind === 'page' && over === headerKey(groupId),
  }
}

export function useLooseHeader() {
  const drop = useDroppable({ id: headerKey(null) })
  const { active, over } = useContext(DndState)
  return {
    setNodeRef: drop.setNodeRef,
    highlighted: active?.kind === 'page' && over === headerKey(null),
  }
}

export function GroupSortable({ groups, children }: { groups: string[]; children: ReactNode }) {
  return (
    <SortableContext items={groups.map(groupKey)} strategy={verticalStrategy}>
      {children}
    </SortableContext>
  )
}
