'use client'

import { Button } from '../ui'
import { ChevronLeft } from '../ui/icons'
import { type CSSProperties, useCallback, useState } from 'react'
import type { PlacedBoard, Size } from './geometry'

const PAD = 24

/** The scale that fits `board` in `space`, never above 1: a board larger than the window shrinks. */
export const playScale = (board: Size, space: Size): number =>
  Math.min(
    1,
    Math.max(0.05, (space.width - PAD * 2) / Math.max(board.width, 1)),
    Math.max(0.05, (space.height - PAD * 2) / Math.max(board.height, 1)),
  )

/**
 * Play full screen: one board over the whole window, live. A page (`board.fill`) takes the whole
 * stage and scrolls like a site; any other board keeps its size and shrinks to fit. "Back to
 * canvas" or Esc closes it; a link in the board swaps the board in place.
 */
export function PlayView({
  board,
  reload,
  onClose,
}: {
  board: PlacedBoard
  reload: number
  onClose: () => void
}) {
  const [space, setSpace] = useState<Size | null>(null)
  // Syncs with the stage's size, an external system: the board refits when the window changes.
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpace({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const k = space ? playScale(board, space) : 0
  const frame = (style: CSSProperties, className: string) => (
    <iframe
      key={`${board.name}:${reload}`}
      src={`/b/${encodeURIComponent(board.name)}`}
      title={board.name}
      sandbox="allow-scripts allow-same-origin"
      className={`block border-0 bg-white ${className}`}
      style={style}
      onLoad={(event) => event.currentTarget.contentWindow?.focus()}
    />
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${board.title || board.name}`}
      className="fixed inset-0 z-40 flex flex-col bg-surface"
      // Canvas shortcuts skip keys inside a dialog, so the header's own Esc closes the view.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onClose()
      }}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft className="size-4" />}
          onClick={onClose}
          aria-keyshortcuts="Escape"
        >
          Back to canvas
        </Button>
        <span dir="auto" className="min-w-0 truncate text-sm font-medium text-foreground">
          {board.title || board.name}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">{board.name}</span>
        <span className="ms-auto shrink-0 text-xs text-muted-foreground">Esc to stop</span>
      </div>
      <div ref={measure} className="relative flex min-h-0 flex-1 items-center justify-center">
        {board.fill ? (
          frame({}, 'absolute inset-0 size-full')
        ) : k > 0 ? (
          <div
            className="relative shrink-0 overflow-hidden rounded-xl bg-white shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
            style={{ width: board.width * k, height: board.height * k }}
          >
            {frame(
              { width: board.width, height: board.height, transform: `scale(${k})` },
              'absolute start-0 top-0 origin-top-left',
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
