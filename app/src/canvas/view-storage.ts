import type { View } from './geometry'

const key = (pageId: string) => `canvas:view:${pageId}`

const isView = (value: unknown): value is View => {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, k } = value as Record<string, unknown>
  return (
    [x, y, k].every((part) => typeof part === 'number' && Number.isFinite(part)) && Number(k) > 0
  )
}

export function readStoredView(pageId: string): View | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key(pageId)) ?? 'null')
    return isView(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredView(pageId: string, view: View) {
  try {
    sessionStorage.setItem(key(pageId), JSON.stringify(view))
  } catch {}
}

const MINIMAP_KEY = 'canvas:minimap'

export function readMinimap(): boolean {
  try {
    return sessionStorage.getItem(MINIMAP_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeMinimap(on: boolean) {
  try {
    sessionStorage.setItem(MINIMAP_KEY, on ? 'on' : 'off')
  } catch {}
}

const SIDEBAR_KEY = 'canvas:sidebar'

/** Whether the sidebar is shown. Kept per viewer in this browser; shown when nothing is stored. */
export function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'hidden'
  } catch {
    return true
  }
}

export function writeSidebar(shown: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, shown ? 'shown' : 'hidden')
  } catch {}
}

const collapsedKey = (pageId: string) => `canvas:collapsed-sections:${pageId}`

export function readCollapsedSections(pageId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(collapsedKey(pageId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeCollapsedSections(pageId: string, ids: string[]) {
  try {
    localStorage.setItem(collapsedKey(pageId), JSON.stringify(ids))
  } catch {}
}
