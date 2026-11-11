import { homedir } from 'node:os'
import { join } from 'node:path'

export const THUMB_WIDTH = 480

/** A thumbnail untouched for this long is pruned by `irsim thumbs`. */
export const THUMB_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * One directory for every project of this machine. The file name carries the board's closure hash,
 * so a thumbnail rendered in one checkout is correct in any other that has the same board content.
 * `IRSIM_THUMBS_DIR` (or legacy `CANVAS_THUMBS_DIR`) overrides it (the tests do).
 */
export const thumbsDir = (): string => {
  const override = process.env.IRSIM_THUMBS_DIR || process.env.CANVAS_THUMBS_DIR
  if (override) return override
  const cache = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(cache, 'irsim', 'thumbs')
}

export const thumbFile = (board: string, hash: string): string => `${board}.${hash}.webp`
