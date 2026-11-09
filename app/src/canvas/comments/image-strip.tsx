'use client'

/* oxlint-disable next/no-img-element -- comment images come from /api/comments/images, no optimiser */

import { IconButton } from '@kafbit/ui'
import { X } from '@kafbit/ui/icons'

export const imageUrl = (id: string): string => `/api/comments/images/${id}`

/** The thumbnails of a comment being written, each with a remove button, and the upload status line. */
export function ImageStrip({
  images,
  uploading,
  message,
  onRemove,
}: {
  images: string[]
  uploading: number
  message: string | null
  onRemove: (id: string) => void
}) {
  return (
    <>
      {images.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {images.map((id, index) => (
            <li key={id} className="relative size-14">
              <img
                src={imageUrl(id)}
                alt={`Attachment ${index + 1}`}
                className="size-14 rounded-md border border-border object-cover"
              />
              <IconButton
                label="Remove image"
                icon={<X className="size-3" />}
                onClick={() => onRemove(id)}
                className="absolute -end-1.5 -top-1.5 size-5 rounded-full border border-border bg-card"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {uploading > 0 ? <p className="m-0 text-xs text-muted-foreground">Uploading...</p> : null}
      {message ? <p className="m-0 text-xs text-destructive">{message}</p> : null}
    </>
  )
}
