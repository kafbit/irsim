import { join } from 'node:path'
import { projectRoot } from './design-dir'

/** Comments, images and logs live in `IRSIM_DATA_DIR` (or legacy `CANVAS_DATA_DIR`), else `<root>/.irsim`. */
export const dataDir = (): string => {
  const override = process.env.IRSIM_DATA_DIR || process.env.CANVAS_DATA_DIR
  return override || join(projectRoot(), '.irsim')
}
