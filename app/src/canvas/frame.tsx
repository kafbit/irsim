'use client'

import { memo, useEffect, useRef, useState } from 'react'
import type { ApprovalState } from './approvals/use-approvals'
import { FramePlay } from './frame-play'
import { labelMaxInline, type PlacedBoard } from './geometry'
import type { Report } from './mount-policy'
import type { PlayMode } from './use-play-links'

function Placeholder({ board }: { board: PlacedBoard }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-secondary text-3xl text-muted-foreground">
      {board.name}
      {failed ? null : (
        // oxlint-disable-next-line next/no-img-element -- dev canvas thumbnails are served by /api/thumbs, no optimiser
        <img
          src={`/api/thumbs/${encodeURIComponent(board.name)}?h=${board.hash}`}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full bg-white object-cover object-top"
        />
      )}
    </div>
  )
}

export const Frame = memo(function Frame({
  board,
  mounted,
  hidden,
  report,
  interacting,
  commenting,
  reload,
  approval,
  onSelect,
  onPlay,
  onStop,
}: {
  board: PlacedBoard
  mounted: boolean
  hidden: boolean
  report: Report | undefined
  interacting: boolean
  commenting: boolean
  reload: number
  approval?: ApprovalState | undefined
  onSelect: (name: string) => void
  onPlay: (name: string, mode: PlayMode) => void
  onStop: (name: string) => void
}) {
  const failed = report?.state === 'error'
  const ready = report?.state === 'ready'
  // Interacting is Play on the canvas: the frame is live, outlined in blue, and has a Stop chip.
  const playing = interacting
  const frame = useRef<HTMLIFrameElement>(null)
  // Gives the keyboard to the board once it plays and has loaded, so its inputs and Esc work even
  // when Play reached it through a link and the frame was not mounted yet. The frame is the
  // external system.
  useEffect(() => {
    if (playing && ready) frame.current?.contentWindow?.focus()
  }, [playing, ready])
  return (
    <div
      data-board={board.name}
      className="absolute"
      style={{ left: board.x, top: board.y, width: board.width, height: board.height }}
    >
      <button
        type="button"
        data-frame-title=""
        onClick={() => onSelect(board.name)}
        className="absolute start-0 bottom-full flex origin-bottom-left cursor-pointer items-baseline gap-2 overflow-hidden pb-1.5 text-start text-xs whitespace-nowrap text-foreground -outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring in-data-labels-off:invisible"
        style={{ maxInlineSize: labelMaxInline(board.width), transform: 'scale(var(--inv, 1))' }}
      >
        {board.interactive ? (
          <span
            role="img"
            aria-label="Prototype"
            className="size-2 shrink-0 self-center rounded-full bg-blue-600"
          />
        ) : null}
        <span dir="auto" className="truncate font-medium">
          {board.title}
        </span>
        <span className="shrink-0 text-muted-foreground">{board.name}</span>
        {approval === 'approved' ? (
          <span className="shrink-0 font-medium text-success-foreground">Approved</span>
        ) : approval === 'changed' ? (
          <span className="shrink-0 font-medium text-warning-foreground">Changed since approval</span>
        ) : null}
      </button>
      {board.interactive || playing ? (
        <FramePlay
          name={board.name}
          title={board.title}
          playing={playing}
          onPlay={onPlay}
          onStop={onStop}
        />
      ) : null}
      <div
        className={`relative size-full overflow-hidden rounded-xl bg-white outline ${
          playing ? 'outline-2 outline-blue-600' : 'outline-1 outline-border'
        }`}
      >
        <Placeholder board={board} />
        {mounted ? (
          <iframe
            ref={frame}
            key={reload}
            src={`/b/${encodeURIComponent(board.name)}`}
            title={board.name}
            sandbox="allow-scripts allow-same-origin"
            className={`absolute inset-0 block size-full border-0 bg-white transition-opacity duration-120 ease-out ${
              interacting || commenting
                ? 'pointer-events-auto in-data-blocked:pointer-events-none in-data-hand:pointer-events-none'
                : 'pointer-events-none'
            }`}
            style={{
              opacity: ready ? 1 : 0,
              visibility: hidden || failed ? 'hidden' : 'visible',
              contentVisibility: hidden ? 'hidden' : 'visible',
            }}
          />
        ) : null}
        {report?.state === 'error' ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-destructive p-6 text-xl text-destructive-foreground">
            {report.message}
          </div>
        ) : null}
      </div>
    </div>
  )
})
