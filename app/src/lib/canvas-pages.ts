import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
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
  /** The id of a section of the same page. */
  section?: string
  /** The base board this board is a variant of. */
  variantOf?: string
  variantLabel?: string
  /** The render hash of the base when the variant was copied. */
  baseHash?: string
}
export type CanvasSection = {
  id: string
  title: string
  variantOf?: string
  baseSection?: string
  parent?: string
  color?: 'gray' | 'blue' | 'green' | 'amber' | 'purple' | 'red'
  /** A stored area; a section without one fits its boards. */
  x?: number
  y?: number
  width?: number
  height?: number
  layout?: { mode: 'wrap'; gap: number }
}
export type CanvasPage = {
  id: string
  title: string
  icon?: string
  sections?: CanvasSection[]
  boards: CanvasBoard[]
}

/** The pages of `canvas.json`, or `[]` when the file does not exist yet. */
export const readCanvasPages = async (): Promise<CanvasPage[]> => {
  const file = join(designDir(), 'canvas.json')
  if (!existsSync(file)) return []
  const canvas = JSON.parse(await readFile(file, 'utf8')) as {
    pages: CanvasPage[]
  }
  return canvas.pages
}

const lucideNames = new Set<string>(Object.keys(dynamicIconImports))

export const isLucideIcon = (name: string): boolean => lucideNames.has(name)
