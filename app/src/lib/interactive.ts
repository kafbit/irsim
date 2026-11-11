const HANDLER = /\son[A-Z][A-Za-z]*\s*=\s*["']\s*\{\{/
const BOARD_LINK = /<a\s[^>]*href\s*=\s*["'](?![a-z][a-z0-9+.-]*:|\/\/)[^"'#?]*\.dc\.html/i

/**
 * True when a board works when played: its own markup binds an event handler (`onClick="{{…}}"`)
 * or links to another board (`<a href="Cart.dc.html">`). Imported boards do not count, or every
 * board that shows a shared table would be a prototype.
 */
export const looksInteractive = (source: string): boolean =>
  HANDLER.test(source) || BOARD_LINK.test(source)

/** `interactive` in `canvas.json` wins; without it the board's source decides. */
export const isInteractive = (flag: unknown, source: string | undefined): boolean =>
  typeof flag === 'boolean' ? flag : source !== undefined && looksInteractive(source)
