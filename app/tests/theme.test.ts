import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, parseTheme, THEME_KEY, themeScript } from '../src/lib/theme'

const run = (stored: string | null | 'throws') => {
  const root = { dataset: {} as Record<string, string> }
  const storage = {
    getItem: (key: string) => {
      if (stored === 'throws') throw new Error('blocked')
      return key === THEME_KEY ? stored : null
    },
  }
  new Function('document', 'localStorage', themeScript)({ documentElement: root }, storage)
  return root.dataset.theme
}

describe('canvas theme', () => {
  it('is dark by default', () => {
    expect(DEFAULT_THEME).toBe('dark')
    expect(parseTheme(undefined)).toBe('dark')
    expect(parseTheme('sepia')).toBe('dark')
  })

  it('keeps a stored light choice', () => {
    expect(parseTheme('light')).toBe('light')
    expect(run('light')).toBe('light')
  })

  it('applies dark before paint when nothing, dark or an unreadable value is stored', () => {
    expect(run(null)).toBe('dark')
    expect(run('dark')).toBe('dark')
    expect(run('throws')).toBeUndefined()
  })
})
