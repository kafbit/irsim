import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { designDir } from './design-dir'

/** A board name: the file `<name>.dc.html` in the design folder. */
export const BOARD_NAME = /^[A-Za-z][A-Za-z0-9]*$/

/** `Leads.dc.html` and `Leads` both name the board `Leads`. */
export const boardNameOf = (value: string): string => value.replace(/\.dc\.html$/, '')

export const boardExists = (name: string): boolean =>
  BOARD_NAME.test(name) && existsSync(join(designDir(), `${name}.dc.html`))
