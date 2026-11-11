import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  imagePath,
  MAX_IMAGE_BYTES,
  readImage,
  removeImages,
  saveImage,
} from '../src/lib/comment-images'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

const bytes = (head: number[], size = 32): Uint8Array => {
  const out = new Uint8Array(size)
  out.set(head)
  return out
}

describe('comment images', () => {
  let dir: string
  const saved = process.env.IRSIM_DATA_DIR

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canvas-images-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ])('saves %s from its magic bytes and reads it back', async (_name, head, type) => {
    const saved = await saveImage(bytes(head))
    if (!saved.ok) throw new Error('expected the image to be saved')
    expect(saved.id).toMatch(/^i_[a-z0-9]+$/)
    expect(await imagePath(saved.id)).toStartWith(join(dir, 'images'))
    const image = await readImage(saved.id)
    expect(image?.type).toBe(type)
    expect(image?.bytes).toEqual(bytes(head))
  })

  it('refuses a text blob as type and an oversized image as size', async () => {
    expect(await saveImage(new TextEncoder().encode('not an image'))).toEqual({
      ok: false,
      reason: 'type',
    })
    expect(await saveImage(bytes(PNG, MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, reason: 'size' })
    expect(await saveImage(bytes(PNG, MAX_IMAGE_BYTES))).toMatchObject({ ok: true })
  })

  it('returns null for a bad or unknown id', async () => {
    expect(await readImage('../comments')).toBeNull()
    expect(await readImage('i_UPPER')).toBeNull()
    expect(await readImage('i_missing')).toBeNull()
    expect(await imagePath('c_1')).toBeNull()
  })

  it('removeImages deletes the files and ignores an unknown id', async () => {
    const one = await saveImage(bytes(PNG))
    const two = await saveImage(bytes(JPEG))
    if (!one.ok || !two.ok) throw new Error('expected the images to be saved')
    const path = await imagePath(one.id)
    await removeImages([one.id, 'i_missing'])
    expect(existsSync(path as string)).toBe(false)
    expect(await imagePath(one.id)).toBeNull()
    expect(await imagePath(two.id)).not.toBeNull()
  })
})
