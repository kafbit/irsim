import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { thumbFile, thumbKey } from '../src/lib/thumbs-dir'
import {
  newestOlderThumb,
  pruneThumbIndex,
  readThumbIndex,
  recordThumb,
  recordThumbIfMissing,
} from '../src/lib/thumbs-index'

describe('thumbnail index', () => {
  let root: string
  let thumbsPath: string
  const saved = { design: process.env.IRSIM_DESIGN_DIR, thumbs: process.env.IRSIM_THUMBS_DIR }

  const useDesign = (name: string): void => {
    const path = join(root, name)
    mkdirSync(path, { recursive: true })
    process.env.IRSIM_DESIGN_DIR = path
  }
  const indexFiles = () => readdirSync(thumbsPath).filter((file) => file.startsWith('index-'))

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thumbs-index-'))
    thumbsPath = join(root, 'thumbs')
    mkdirSync(thumbsPath)
    process.env.IRSIM_THUMBS_DIR = thumbsPath
    useDesign('one')
  })

  afterEach(() => {
    if (saved.design === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved.design
    if (saved.thumbs === undefined) delete process.env.IRSIM_THUMBS_DIR
    else process.env.IRSIM_THUMBS_DIR = saved.thumbs
    rmSync(root, { recursive: true, force: true })
  })

  it('keys a thumbnail by render hash and size', () => {
    const a = thumbKey('abc', { width: 100, height: 100 })
    const b = thumbKey('abc', { width: 200, height: 100 })
    expect(a).toBe('abc-100x100')
    expect(b).not.toBe(a)
    expect(thumbFile(a)).toBe('abc-100x100.webp')
  })

  it('keeps one index file per design directory', async () => {
    await recordThumb('Card', 'k1-1x1')
    expect(indexFiles()).toHaveLength(1)
    expect(indexFiles()[0]).toMatch(/^index-[0-9a-f]{12}\.json$/)
    useDesign('two')
    await recordThumb('Card', 'k2-1x1')
    expect(indexFiles()).toHaveLength(2)
  })

  it('does not show one project the entries of another', async () => {
    writeFileSync(join(thumbsPath, thumbFile('k1-1x1')), 'one')
    await recordThumb('Card', 'k1-1x1')
    expect(await newestOlderThumb('Card', 'current-1x1')).toBe('k1-1x1')
    useDesign('two')
    expect((await readThumbIndex()).Card).toBeUndefined()
    expect(await newestOlderThumb('Card', 'current-1x1')).toBeUndefined()
    await recordThumb('Card', 'k2-1x1')
    expect((await readThumbIndex()).Card?.map((entry) => entry.key)).toEqual(['k2-1x1'])
    useDesign('one')
    expect((await readThumbIndex()).Card?.map((entry) => entry.key)).toEqual(['k1-1x1'])
  })

  it('skips the disk read for a key this process already recorded', async () => {
    await recordThumbIfMissing('Card', 'k1-1x1')
    const [file] = indexFiles()
    expect(file).toBeDefined()
    rmSync(join(thumbsPath, file ?? ''))
    await recordThumbIfMissing('Card', 'k1-1x1')
    expect(indexFiles()).toEqual([])
    await recordThumbIfMissing('Card', 'k2-1x1')
    expect((await readThumbIndex()).Card?.map((entry) => entry.key)).toEqual(['k2-1x1'])
  })

  it('remembers a key found in the index', async () => {
    await recordThumb('Card', 'k1-1x1')
    await recordThumbIfMissing('Card', 'k1-1x1')
    const [file] = indexFiles()
    rmSync(join(thumbsPath, file ?? ''))
    await recordThumbIfMissing('Card', 'k1-1x1')
    expect(indexFiles()).toEqual([])
  })

  it('prune drops entries whose file is gone', async () => {
    writeFileSync(join(thumbsPath, thumbFile('keep-1x1')), 'x')
    await recordThumb('Card', 'gone-1x1')
    await recordThumb('Card', 'keep-1x1')
    await pruneThumbIndex()
    expect((await readThumbIndex()).Card?.map((entry) => entry.key)).toEqual(['keep-1x1'])
    await recordThumbIfMissing('Card', 'gone-1x1')
    expect((await readThumbIndex()).Card?.map((entry) => entry.key)).toContain('gone-1x1')
  })
})
