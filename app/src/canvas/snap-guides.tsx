'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import type { Camera } from './camera'
import type { Guide } from './snap'

export type SnapGuidesHandle = { set: (guides: Guide[]) => void }

/** The alignment lines shown while a frame snaps. They sit in viewport pixels and do not take the pointer. */
export const SnapGuides = forwardRef<SnapGuidesHandle, { camera: Camera }>(function SnapGuides(
  { camera },
  ref,
) {
  const [guides, setGuides] = useState<Guide[]>([])
  useImperativeHandle(ref, () => ({ set: setGuides }), [])
  if (guides.length === 0) return null
  const { x, y, k } = camera.view
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {guides.map((guide) => (
        <div
          key={`${guide.axis}:${guide.at}`}
          className="pointer-events-none absolute bg-ring"
          style={
            guide.axis === 'x'
              ? {
                  left: guide.at * k + x,
                  top: guide.from * k + y,
                  width: 1,
                  height: (guide.to - guide.from) * k,
                }
              : {
                  left: guide.from * k + x,
                  top: guide.at * k + y,
                  width: (guide.to - guide.from) * k,
                  height: 1,
                }
          }
        />
      ))}
    </div>
  )
})
