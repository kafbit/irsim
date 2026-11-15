'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_THEME, parseTheme, THEME_KEY, type Theme } from '../lib/theme'

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const current = (): Theme => parseTheme(document.documentElement.dataset.theme)

/** The canvas theme, read from `<html data-theme>`, which the head script set before the first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => DEFAULT_THEME)
  const set = (next: Theme) => {
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
    for (const listener of listeners) listener()
  }
  return { theme, set, toggle: () => set(theme === 'dark' ? 'light' : 'dark') }
}
