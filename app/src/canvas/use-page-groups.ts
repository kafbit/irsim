'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addGroup,
  moveGroup,
  movePage,
  normalize,
  renameGroup,
  toggleGroup,
  ungroup,
  type PageGroups,
  type PageTarget,
} from './page-groups'

const KEY = 'canvas:page-groups'

const read = (): unknown => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

const write = (state: PageGroups) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
}

const newId = () => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export function usePageGroups(pageIds: readonly string[]) {
  const [state, setState] = useState(() => normalize(null, pageIds))
  const ids = useRef(pageIds)
  const key = pageIds.join('\n')
  ids.current = pageIds

  useEffect(() => {
    setState(normalize(read(), ids.current))
  }, [key])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY && event.key !== null) return
      setState(normalize(read(), ids.current))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const apply = useCallback((change: (current: PageGroups) => PageGroups) => {
    setState((current) => {
      const next = change(current)
      if (next !== current) write(next)
      return next
    })
  }, [])

  return {
    state,
    add: useCallback((title: string) => apply((s) => addGroup(s, title, newId())), [apply]),
    rename: useCallback((id: string, title: string) => apply((s) => renameGroup(s, id, title)), [apply]),
    ungroup: useCallback((id: string) => apply((s) => ungroup(s, id)), [apply]),
    toggle: useCallback((id: string) => apply((s) => toggleGroup(s, id)), [apply]),
    movePage: useCallback(
      (pageId: string, target: PageTarget) => apply((s) => movePage(s, pageId, target)),
      [apply],
    ),
    moveGroup: useCallback(
      (groupId: string, before: string | null) => apply((s) => moveGroup(s, groupId, before)),
      [apply],
    ),
  }
}
