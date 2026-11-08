export type Theme = 'dark' | 'light'

export const THEME_KEY = 'canvas:theme'
export const DEFAULT_THEME: Theme = 'dark'

/** Dark unless the stored value is exactly `light`, so a missing or unknown value is the default. */
export const parseTheme = (value: unknown): Theme => (value === 'light' ? 'light' : DEFAULT_THEME)

/**
 * Runs in `<head>` before the first paint, so a reader who chose light does not see a dark flash.
 * Inline because it must run before React hydrates; kept to one statement for that reason.
 */
export const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('${THEME_KEY}')==='light'?'light':'dark'}catch(e){}`
