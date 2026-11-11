import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { designDir } from './design-dir'

export type CanvasBoard = {
  name: string
  title: string
  x: number
  y: number
  width: number
  height: number
  /** Set by hand to override the guess from the board source. */
  interactive?: boolean
  /** `"fill"`: a web page, which fills the window in full screen play. */
  expand?: string
}
export type CanvasPage = { id: string; title: string; boards: CanvasBoard[] }

/** The pages of `canvas.json`, or `[]` when the file does not exist yet. */
export const readCanvasPages = async (): Promise<CanvasPage[]> => {
  const file = join(designDir(), 'canvas.json')
  if (!existsSync(file)) return []
  const canvas = JSON.parse(await readFile(file, 'utf8')) as {
    pages: CanvasPage[]
  }
  return canvas.pages
}
