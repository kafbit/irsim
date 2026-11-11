import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from './data-dir'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_ID = /^i_[a-z0-9]+$/

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp'

const EXTENSION: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const TYPE_OF: Record<string, ImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value)

/** Reads the type from the magic bytes; the client's content type is never trusted. */
export const sniffImage = (bytes: Uint8Array): ImageType | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'
  return null
}

const imagesDir = (): string => join(dataDir(), 'images')

const newId = (): string =>
  `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`

/** Stores a PNG, JPEG or WebP of at most 5 MB under `<data dir>/images`. Refuses anything else without writing. */
export const saveImage = async (
  bytes: Uint8Array,
): Promise<{ ok: true; id: string } | { ok: false; reason: 'type' | 'size' }> => {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: 'size' }
  const type = sniffImage(bytes)
  if (!type) return { ok: false, reason: 'type' }
  const id = newId()
  await mkdir(imagesDir(), { recursive: true })
  await writeFile(join(imagesDir(), `${id}.${EXTENSION[type]}`), bytes)
  return { ok: true, id }
}

/** The absolute path of a stored image, or null when the id is malformed or no file exists. */
export const imagePath = async (id: string): Promise<string | null> => {
  if (!IMAGE_ID.test(id)) return null
  for (const extension of Object.values(EXTENSION)) {
    const path = join(imagesDir(), `${id}.${extension}`)
    if (
      await stat(path).then(
        (entry) => entry.isFile(),
        () => false,
      )
    )
      return path
  }
  return null
}

export const readImage = async (
  id: string,
): Promise<{ bytes: Uint8Array; type: ImageType } | null> => {
  const path = await imagePath(id)
  if (!path) return null
  const type = TYPE_OF[path.slice(path.lastIndexOf('.') + 1)]
  if (!type) return null
  return { bytes: new Uint8Array(await readFile(path)), type }
}

/** Deletes the files of the given ids; an id with no file is ignored. */
export const removeImages = async (ids: string[]): Promise<void> => {
  for (const id of ids) {
    const path = await imagePath(id)
    if (path) await rm(path, { force: true })
  }
}
