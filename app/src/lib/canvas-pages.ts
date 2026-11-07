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
}
export type CanvasPage = { id: string; title: string; boards: CanvasBoard[] }

export const readCanvasPages = async (): Promise<CanvasPage[]> => {
  const canvas = JSON.parse(await readFile(join(designDir(), 'canvas.json'), 'utf8')) as {
    pages: CanvasPage[]
  }
  return canvas.pages
}
