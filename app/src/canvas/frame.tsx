'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ApprovalState } from './approvals/use-approvals'
import { FramePlay } from './frame-play'
import { labelMaxInline, type PlacedBoard } from './geometry'
import type { Report } from './mount-policy'
import type { PlayMode } from './use-play-links'

type Thumb = { rev: number; ok: boolean }

function Placeholder({
  board,
  thumb,
  live,
  onStale,
}: {
  board: PlacedBoard
  thumb: Thumb | undefined
  live: boolean
  onStale: (rev: number, stale: boolean) => void
}) {
  const rev = thumb?.rev ?? 0
  const [seen, setSeen] = useState<{ rev: number; state: 'loaded' | 'pending' | 'failed' } | null>(
    null,
  )
  const current = seen?.rev === rev ? seen : null
  const failed = thumb?.ok === false || current?.state === 'failed'
  const pending = !failed && current?.state === 'pending'
  const src = `/api/thumbs/${encodeURIComponent(board.name)}?h=${board.hash}-${board.width}x${board.height}`
  const imageSrc = thumb ? `${src}&r=${thumb.rev}` : src
  const onLoad = () => {
    setSeen({ rev, state: 'loaded' })
    void fetch(imageSrc)
      .then((response) => onStale(rev, response.headers.get('X-Thumb-Stale') === '1'))
      .catch(() => onStale(rev, false))
  }
  const onError = () => {
    setSeen({ rev, state: 'pending' })
    void fetch(src, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) setSeen({ rev, state: 'failed' })
      })
      .catch(() => setSeen({ rev, state: 'failed' }))
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center text-3xl text-muted-foreground">
      <div className={`absolute inset-0 bg-secondary ${pending ? 'animate-pulse' : ''}`} />
      <span className="relative">{board.name}</span>
      {(!live || seen !== null) && !failed && !pending ? (
        // oxlint-disable-next-line next/no-img-element -- dev canvas thumbnails are served by /api/thumbs, no optimiser
        <img
          key={rev}
          src={imageSrc}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          className="absolute inset-0 size-full bg-white object-cover object-top"
        />
      ) : null}
    </div>
  )
}

function Status({
  label,
  hint,
  text,
  dot,
}: {
  label: string
  hint?: string
  text: string
  dot: string
}) {
  return (
    <>
      <span title={hint} className={`shrink-0 font-medium @max-[200px]:hidden ${text}`}>
        {label}
      </span>
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`hidden size-2 shrink-0 self-center rounded-full @max-[200px]:block ${dot}`}
      />
    </>
  )
}

export const Frame = memo(function Frame({
  board,
  mounted,
  hidden,
  report,
  interacting,
  commenting,
  selected,
  reload,
  approval,
  thumb,
  onSelect,
  onComment,
  onPlay,
  onStop,
}: {
  board: PlacedBoard & { unchanged?: boolean | undefined }
  mounted: boolean
  hidden: boolean
  report: Report | undefined
  interacting: boolean
  commenting: boolean
  selected: boolean
  reload: number
  approval?: ApprovalState | undefined
  thumb?: Thumb | undefined
  onSelect: (name: string, additive: boolean) => void
  onComment: (name: string) => void
  onPlay: (name: string, mode: PlayMode) => void
  onStop: (name: string) => void
}) {
  const failed = report?.state === 'error'
  const ready = report?.state === 'ready'
  // Interacting is Play on the canvas: the frame is live, outlined in blue, and has a Stop chip.
  const playing = interacting
  const frame = useRef<HTMLIFrameElement>(null)
  const [staleRev, setStaleRev] = useState<number | null>(null)
  const onStale = useCallback(
    (rev: number, stale: boolean) => setStaleRev(stale ? rev : null),
    [],
  )
  const outdated = staleRev !== null && staleRev === (thumb?.rev ?? 0) && !ready
  const notChanged = board.unchanged === true
  // Gives the keyboard to the board once it plays and has loaded, so its inputs and Esc work even
  // when Play reached it through a link and the frame was not mounted yet. The frame is the
  // external system.
  useEffect(() => {
    if (playing && ready) frame.current?.contentWindow?.focus()
  }, [playing, ready])
  return (
    <div
      data-board={board.name}
      data-keep={selected || playing || commenting || mounted ? '' : undefined}
      className="absolute [&[data-culled]:not([data-keep])]:[content-visibility:hidden]"
      style={{ left: board.x, top: board.y, width: board.width, height: board.height }}
    >
      <div
        className="peer pointer-events-none absolute start-0 bottom-full flex origin-bottom-left items-end @container"
        style={{ inlineSize: 'calc(var(--k, 1) * 100%)', transform: 'scale(var(--inv, 1))' }}
      >
        <button
          type="button"
          data-frame-title=""
          onClick={(event) =>
            commenting ? onComment(board.name) : onSelect(board.name, event.shiftKey)
          }
          className={`pointer-events-auto flex min-w-0 items-baseline gap-2 overflow-hidden pb-1.5 text-start text-xs whitespace-nowrap text-foreground -outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${
            commenting
              ? 'cursor-crosshair in-data-labels-off:invisible'
              : 'cursor-pointer in-data-labels-off:invisible'
          } ${board.interactive && !playing ? '@max-[200px]:max-w-[calc(100%-32px)]!' : ''}`}
          style={{ maxInlineSize: labelMaxInline(board.width) }}
        >
          {board.interactive ? (
            <span
              role="img"
              aria-label="Prototype"
              className="size-2 shrink-0 self-center rounded-full bg-blue-600"
            />
          ) : null}
          {/* Before the title, so a narrow board truncates the title and keeps the approval state. */}
          {outdated ? (
            <Status label="Outdated" text="text-warning-foreground" dot="bg-warning-foreground" />
          ) : null}
          {notChanged ? (
            <Status
              label="Not changed yet"
              text="text-muted-foreground"
              dot="bg-muted-foreground"
            />
          ) : null}
          {approval === 'approved' ? (
            <Status label="Approved" text="text-success-foreground" dot="bg-success-foreground" />
          ) : approval === 'changed' ? (
            <Status
              label="Changed"
              hint="Changed since approval"
              text="text-warning-foreground"
              dot="bg-warning-foreground"
            />
          ) : approval === 'new' ? (
            <Status label="New" text="text-info-foreground" dot="bg-info-foreground" />
          ) : null}
          <span dir="auto" className="truncate font-medium">
            {board.title}
          </span>
          <span className="min-w-0 shrink-[10000] truncate text-muted-foreground">
            {board.name}
          </span>
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
      </div>
      <div
        className={`relative size-full overflow-clip rounded-xl bg-white outline ${
          playing ? 'outline-2 outline-blue-600' : 'outline-1 outline-border'
        }`}
      >
        <Placeholder
          board={board}
          thumb={thumb}
          live={mounted && ready && !hidden}
          onStale={onStale}
        />
        {mounted ? (
          <iframe
            ref={frame}
            key={reload}
            src={`/b/${encodeURIComponent(board.name)}?canvas=1`}
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
      {commenting ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden rounded-xl outline-pick peer-has-[[data-frame-title]:hover]:block peer-has-[[data-frame-title]:focus-visible]:block"
          style={{
            outlineWidth: 'calc(2px * var(--inv, 1))',
            outlineOffset: 'calc(-2px * var(--inv, 1))',
            outlineStyle: 'solid',
          }}
        />
      ) : null}
    </div>
  )
})
