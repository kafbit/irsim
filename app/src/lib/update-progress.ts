import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type UpdateProgress = { stage: 'download'; received: number; total: number } | { stage: 'install' }

export const readUpdateProgress = async (prefix: string | undefined): Promise<UpdateProgress | null> => {
  if (!prefix) return null
  try {
    const body = JSON.parse(await readFile(join(prefix, '.update.lock', 'progress.json'), 'utf8')) as {
      stage?: unknown
      received?: unknown
      total?: unknown
    } | null
    if (body?.stage === 'install') return { stage: 'install' }
    if (
      body?.stage === 'download' &&
      typeof body.received === 'number' &&
      typeof body.total === 'number' &&
      Number.isFinite(body.received) &&
      Number.isFinite(body.total)
    )
      return { stage: 'download', received: body.received, total: body.total }
    return null
  } catch {
    return null
  }
}
