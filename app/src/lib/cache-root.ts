import { homedir } from 'node:os'
import { join } from 'node:path'

export const cacheRoot = (): string =>
  process.env.IRSIM_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'irsim')
