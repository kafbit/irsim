import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const dataDir = (): string => {
  const override = process.env.CANVAS_DATA_DIR
  if (override) return override
  const cwd = process.cwd()
  const root = existsSync(join(cwd, 'apps/design')) ? join(cwd, 'apps/design') : cwd
  return join(root, '.data')
}
