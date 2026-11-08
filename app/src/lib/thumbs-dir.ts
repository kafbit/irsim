import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const THUMB_WIDTH = 480

export const thumbsDir = (): string => {
  const override = process.env.CANVAS_THUMBS_DIR
  if (override) return override
  const cwd = process.cwd()
  const root = existsSync(join(cwd, 'apps/design')) ? join(cwd, 'apps/design') : cwd
  return join(root, '.data/thumbs')
}

export const thumbFile = (board: string, hash: string): string => `${board}.${hash}.webp`
