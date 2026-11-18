export type PageGroup = { id: string; title: string; collapsed: boolean; pages: string[] }
export type PageGroups = { groups: PageGroup[]; loose: string[] }
export type PageTarget = { group: string | null; before: string | null }


const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function normalize(stored: unknown, pageIds: readonly string[]): PageGroups {
  const known = new Set(pageIds)
  const seen = new Set<string>()
  const take = (ids: unknown): string[] => {
    if (!Array.isArray(ids)) return []
    const kept: string[] = []
    for (const id of ids) {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue
      seen.add(id)
      kept.push(id)
    }
    return kept
  }
  const groups: PageGroup[] = []
  const groupIds = new Set<string>()
  let loose: string[] = []
  if (isRecord(stored)) {
    if (Array.isArray(stored.groups)) {
      for (const raw of stored.groups) {
        if (!isRecord(raw)) continue
        const { id, title, collapsed } = raw
        if (typeof id !== 'string' || id === '' || groupIds.has(id)) continue
        if (typeof title !== 'string' || title.trim() === '') continue
        if (typeof collapsed !== 'boolean') continue
        groupIds.add(id)
        groups.push({ id, title, collapsed, pages: take(raw.pages) })
      }
    }
    loose = take(stored.loose)
  }
  for (const id of pageIds) {
    if (!seen.has(id)) {
      seen.add(id)
      loose.push(id)
    }
  }
  return { groups, loose }
}

export function addGroup(state: PageGroups, title: string, id: string): PageGroups {
  const trimmed = title.trim()
  if (trimmed === '') return state
  return { ...state, groups: [...state.groups, { id, title: trimmed, collapsed: false, pages: [] }] }
}

export function renameGroup(state: PageGroups, id: string, title: string): PageGroups {
  const trimmed = title.trim()
  if (trimmed === '') return state
  return {
    ...state,
    groups: state.groups.map((group) => (group.id === id ? { ...group, title: trimmed } : group)),
  }
}

export function ungroup(state: PageGroups, id: string): PageGroups {
  const target = state.groups.find((group) => group.id === id)
  if (!target) return state
  return {
    groups: state.groups.filter((group) => group.id !== id),
    loose: [...state.loose, ...target.pages],
  }
}

export function toggleGroup(state: PageGroups, id: string): PageGroups {
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === id ? { ...group, collapsed: !group.collapsed } : group,
    ),
  }
}

const insert = (list: string[], id: string, before: string | null): string[] => {
  const index = before === null ? -1 : list.indexOf(before)
  if (index < 0) return [...list, id]
  return [...list.slice(0, index), id, ...list.slice(index)]
}

export function movePage(state: PageGroups, pageId: string, target: PageTarget): PageGroups {
  if (target.before === pageId) return state
  if (target.group !== null && !state.groups.some((group) => group.id === target.group)) return state
  const without = (list: string[]) => list.filter((id) => id !== pageId)
  const groups = state.groups.map((group) => {
    const pages = without(group.pages)
    return {
      ...group,
      pages: group.id === target.group ? insert(pages, pageId, target.before) : pages,
    }
  })
  const loose = without(state.loose)
  return { groups, loose: target.group === null ? insert(loose, pageId, target.before) : loose }
}

export function moveGroup(state: PageGroups, groupId: string, before: string | null): PageGroups {
  if (before === groupId) return state
  const moved = state.groups.find((group) => group.id === groupId)
  if (!moved) return state
  const rest = state.groups.filter((group) => group.id !== groupId)
  const index = before === null ? -1 : rest.findIndex((group) => group.id === before)
  if (index < 0) return { ...state, groups: [...rest, moved] }
  return { ...state, groups: [...rest.slice(0, index), moved, ...rest.slice(index)] }
}
