import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const designDir = (): string => {
  const override = process.env.CANVAS_DESIGN_DIR
  if (override) return override
  for (const candidate of [join(process.cwd(), 'design'), join(process.cwd(), '../../design')]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('design/ not found: run the canvas from inside the repository')
}
