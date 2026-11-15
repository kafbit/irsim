import { join } from 'node:path'
import { cacheRoot } from './cache-root'

export const THUMB_WIDTH = 480

/** A thumbnail untouched for this long is pruned by `irsim thumbs`. */
export const THUMB_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * One directory for every project of this machine. The file name carries the board's thumbnail key, its
 * closure render hash and its size, so a thumbnail rendered in one checkout is correct in any other that
 * has the same board content at the same size.
 * `IRSIM_THUMBS_DIR` (or legacy `CANVAS_THUMBS_DIR`) overrides it (the tests do).
 */
export const thumbsDir = (): string => {
  const override = process.env.IRSIM_THUMBS_DIR || process.env.CANVAS_THUMBS_DIR
  if (override) return override
  return join(cacheRoot(), 'thumbs')
}

/** The render hash alone ignores the size the board is rendered at, so the key adds it. */
export const thumbKey = (render: string, size: { width: number; height: number }): string =>
  `${render}-${size.width}x${size.height}`

export const thumbFile = (key: string): string => `${key}.webp`
