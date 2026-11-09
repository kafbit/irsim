export type Command =
  | 'fit-page'
  | 'fit-selection'
  | 'actual-size'
  | 'zoom-in'
  | 'zoom-out'
  | 'next-board'
  | 'previous-board'
  | 'interact'
  | 'escape'
  | 'search'
  | 'tool-move'
  | 'tool-hand'
  | 'tool-comment'
  | 'nudge-left'
  | 'nudge-right'
  | 'nudge-up'
  | 'nudge-down'
  | 'nudge-far-left'
  | 'nudge-far-right'
  | 'nudge-far-up'
  | 'nudge-far-down'

const NUDGES = new Map<string, [Command, Command]>([
  ['ArrowLeft', ['nudge-left', 'nudge-far-left']],
  ['ArrowRight', ['nudge-right', 'nudge-far-right']],
  ['ArrowUp', ['nudge-up', 'nudge-far-up']],
  ['ArrowDown', ['nudge-down', 'nudge-far-down']],
])

const nudgeFor = (key: string, far: boolean): Command | null =>
  NUDGES.get(key)?.[far ? 1 : 0] ?? null

/** Ctrl or Cmd with `+`, `=`, `-` or `_` zooms the canvas instead of the browser page. */
export function zoomChord({
  key,
  ctrlKey,
  metaKey,
  altKey,
}: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): 'zoom-in' | 'zoom-out' | null {
  if (!(ctrlKey || metaKey) || altKey) return null
  if (key === '+' || key === '=') return 'zoom-in'
  if (key === '-' || key === '_') return 'zoom-out'
  return null
}

export type KeyInput = { key: string; code: string; shiftKey: boolean }

/** Shift+digit is read from `code`, because `key` holds `!` or `@` on some layouts. Plain `0` and `1` stay as aliases. */
export function commandFor({ key, code, shiftKey }: KeyInput): Command | null {
  const arrow = nudgeFor(key, shiftKey)
  if (arrow) return arrow
  if (shiftKey) {
    if (code === 'Digit1') return 'fit-page'
    if (code === 'Digit2') return 'fit-selection'
    if (code === 'Digit0') return 'actual-size'
    if (key === 'N') return 'previous-board'
    if (key === '+') return 'zoom-in'
    return null
  }
  switch (key) {
    case '0':
      return 'fit-page'
    case '1':
      return 'actual-size'
    case '+':
    case '=':
      return 'zoom-in'
    case '-':
      return 'zoom-out'
    case 'n':
      return 'next-board'
    case 'Enter':
      return 'interact'
    case 'Escape':
      return 'escape'
    case '/':
      return 'search'
    case 'v':
      return 'tool-move'
    case 'h':
      return 'tool-hand'
    case 'c':
      return 'tool-comment'
    default:
      return null
  }
}
