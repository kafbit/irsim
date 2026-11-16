import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readUpdateProgress } from '../src/lib/update-progress'

describe('readUpdateProgress', () => {
  let prefix: string
  const write = (text: string) => {
    mkdirSync(join(prefix, '.update.lock'), { recursive: true })
    writeFileSync(join(prefix, '.update.lock', 'progress.json'), text)
  }

  beforeEach(() => {
    prefix = mkdtempSync(join(tmpdir(), 'progress-'))
  })

  afterEach(() => {
    rmSync(prefix, { recursive: true, force: true })
  })

  it('reads the download payload', async () => {
    write('{"stage":"download","received":42,"total":100}')
    expect(await readUpdateProgress(prefix)).toEqual({ stage: 'download', received: 42, total: 100 })
  })

  it('reads the install payload', async () => {
    write('{"stage":"install"}')
    expect(await readUpdateProgress(prefix)).toEqual({ stage: 'install' })
  })

  it('returns null when the file is missing or the prefix is unset', async () => {
    expect(await readUpdateProgress(prefix)).toBeNull()
    expect(await readUpdateProgress(undefined)).toBeNull()
  })

  it('returns null for bad JSON or an unknown shape', async () => {
    write('{not json')
    expect(await readUpdateProgress(prefix)).toBeNull()
    write('{"stage":"download","received":"x"}')
    expect(await readUpdateProgress(prefix)).toBeNull()
  })
})
