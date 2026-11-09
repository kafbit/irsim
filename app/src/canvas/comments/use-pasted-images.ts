'use client'

import { useRef, useState, type ClipboardEvent } from 'react'
import { UploadError, uploadImage } from './use-comments'

export const MAX_IMAGES = 4

const imageFiles = (data: DataTransfer): File[] => {
  const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
  if (files.length > 0) return files
  return Array.from(data.items).flatMap((item) => {
    const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null
    return file ? [file] : []
  })
}

/** Image ids of one comment form. A paste with an image file uploads it; a plain text paste is left to the textarea. */
export function usePastedImages(initial: string[] = []) {
  const [images, setImages] = useState(initial)
  const [uploading, setUploading] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const reserved = useRef(initial.length)
  const epoch = useRef(0)

  const add = async (file: File) => {
    const mine = epoch.current
    reserved.current += 1
    setUploading((count) => count + 1)
    try {
      const id = await uploadImage(file)
      if (mine === epoch.current) setImages((list) => [...list, id])
    } catch (failure) {
      if (mine !== epoch.current) return
      reserved.current -= 1
      setMessage(
        failure instanceof UploadError && failure.refused
          ? failure.message
          : 'Could not upload the image.',
      )
    } finally {
      if (mine === epoch.current) setUploading((count) => count - 1)
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFiles(event.clipboardData)
    if (files.length === 0) return
    event.preventDefault()
    const room = Math.max(MAX_IMAGES - reserved.current, 0)
    setMessage(files.length > room ? `Up to ${MAX_IMAGES} images.` : null)
    for (const file of files.slice(0, room)) void add(file)
  }

  const remove = (id: string) => {
    reserved.current -= 1
    setImages((list) => list.filter((image) => image !== id))
  }

  const reset = (list: string[]) => {
    epoch.current += 1
    reserved.current = list.length
    setImages(list)
    setUploading(0)
    setMessage(null)
  }

  return { images, uploading, message, onPaste, remove, reset }
}
