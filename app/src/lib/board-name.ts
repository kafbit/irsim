import { boardFileName, boardNameOf as stripSuffix } from './board-file.mjs'
import { designDir } from './design-dir'

/** A board name: the file `<name>.html` (or the legacy `<name>.dc.html`) in the design folder. */
export const BOARD_NAME = /^[A-Za-z][A-Za-z0-9]*$/

/** `Leads.html`, `Leads.dc.html` and `Leads` all name the board `Leads`. */
export const boardNameOf = (value: string): string => stripSuffix(value)

export const boardExists = (name: string): boolean =>
  BOARD_NAME.test(name) && boardFileName(designDir(), name) !== null
