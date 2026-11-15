import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from './data-dir'

/**
 * `new`: not in the baseline and never approved. `changed`: its content differs from its latest
 * approval, or from the baseline when it has none. `approved`: as the user approved it. `none`:
 * as it was when the page was first seen.
 */
export type BoardStatus = 'new' | 'changed' | 'approved' | 'none'

export type Baseline = Record<string, Record<string, string>>

export const statusOf = (input: {
  hash: string
  baseline: string | undefined
  approvalHash: string | undefined
}): BoardStatus => {
  const { hash, baseline, approvalHash } = input
  if (approvalHash !== undefined) return approvalHash === hash ? 'approved' : 'changed'
  if (baseline === undefined) return 'new'
  return baseline === hash ? 'none' : 'changed'
}

const file = () => join(dataDir(), 'baseline.json')

const read = async (): Promise<Baseline> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Baseline) : {}
  } catch {
    return {}
  }
}

/**
 * The baseline of `page`. The first time a page is seen every board is recorded, so an existing
 * project does not show all of its boards as New. The file lives in `.irsim/`, which git ignores,
 * and is never part of the design files.
 */
export const baselineOf = async (
  page: string,
  hashes: Record<string, string>,
): Promise<Record<string, string>> => {
  const all = await read()
  const known = all[page]
  if (known) return known
  const next = { ...all, [page]: hashes }
  try {
    await mkdir(dataDir(), { recursive: true })
    const temp = `${file()}.${process.pid}.tmp`
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`)
    await rename(temp, file())
  } catch {
    // Read-only data folder: the status is a convenience, so nothing shows as New.
  }
  return hashes
}
