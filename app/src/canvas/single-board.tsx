'use client'

import { Button } from '@kafbit/ui'
import Link from 'next/link'
import type { ManifestBoard } from './types'

export function SingleBoard({
  name,
  pageId,
  board,
}: {
  name: string
  pageId: string
  board: ManifestBoard | undefined
}) {
  return (
    <div className="flex h-screen overflow-auto bg-surface">
      <Button asChild variant="secondary" size="sm" className="fixed start-3 top-3 z-10">
        <Link href={`/p/${encodeURIComponent(pageId)}?board=${encodeURIComponent(name)}`}>
          Back
        </Link>
      </Button>
      <iframe
        src={`/b/${encodeURIComponent(name)}`}
        title={name}
        sandbox="allow-scripts allow-same-origin"
        className={`m-auto block border-0 bg-white ${board ? '' : 'h-screen w-full'}`}
        style={board ? { width: board.width, height: board.height } : undefined}
      />
    </div>
  )
}
