'use client'

import { Button } from '../ui'
import { ChevronLeft, MessageSquare } from '../ui/icons'
import { presetLabel } from '../lib/view-label'
import { isWholeBoard } from '../lib/place-text'
import {
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CommentLayer } from './comments/comment-layer'
import { FrameComposer } from './comments/frame-composer'
import { ThreadPanel } from './comments/thread-panel'
import type { Comment, CommentView, PickedElement } from './comments/types'
import type { useComments } from './comments/use-comments'
import { useCommentMode } from './comments/use-comment-mode'
import type { PlacedBoard, Size } from './geometry'
import {
  presetState,
  readViewport,
  readZoom,
  rotate,
  stateFromView,
  type PresetId,
  type ViewportState,
  viewOf,
  withSize,
  writeViewport,
  type ZoomMode,
  zoomScale,
} from './viewport'
import { ViewportBar } from './viewport-bar'

export { playScale } from './viewport'

const STORAGE_KEY = 'canvas:play-viewport'
const ZOOM_KEY = 'canvas:play-zoom'
const SHADOW = 'shadow-[0_14px_36px_rgba(20,22,26,0.14)]'
const GRIP = 'absolute rounded-[3px] bg-border-strong'

type Axis = { x: boolean; y: boolean }
type Drag = {
  x: number
  y: number
  width: number
  height: number
  k: number
  axis: Axis
  last: ViewportState | null
}
type Picked = { pick: PickedElement; view: CommentView }

const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be blocked: the choice then lasts for this view only.
  }
}

const scaled = (rect: Comment['rect'], k: number, scroll: { x: number; y: number }) => ({
  x: (rect.x - scroll.x) * k,
  y: (rect.y - scroll.y) * k,
  width: rect.width * k,
  height: rect.height * k,
})

const scrollFrameTo = (win: Window | null | undefined, comment: Comment) => {
  const { view } = comment
  win?.postMessage(
    {
      type: 'scroll-to',
      rect: isWholeBoard(comment) ? undefined : comment.rect,
      scroll: view ? { x: view.scrollX, y: view.scrollY } : undefined,
    },
    window.location.origin,
  )
}

const typing = (target: EventTarget) => {
  const element = target as HTMLElement
  return (
    element.isContentEditable ||
    element.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

const radiusOf = (preset: PresetId, fill: boolean) =>
  fill ? 0 : preset === 'phone' || preset === 'large-phone' ? 18 : 10

const insideMenu = (target: HTMLElement) =>
  target.closest('[role="menu"], [role="menuitemradio"], [data-radix-popper-content-wrapper]') !==
  null

/**
 * Play full screen: one board over the whole window, live. The header picks a device viewport or a
 * free size; the board then lays out for that size, so its media queries answer to it. A page
 * (`board.fill`) in Fit takes the whole stage and scrolls like a site. Comment mode picks an element
 * in the frame and records the viewport with the comment. "Back to canvas" or Esc closes it; a link
 * in the board swaps the board in place.
 */
export function PlayView({
  board,
  reload,
  onClose,
  page,
  thread,
  numbers,
  start = null,
  canVary = true,
}: {
  board: PlacedBoard
  reload: number
  onClose: () => void
  page: string
  thread: ReturnType<typeof useComments>
  numbers: ReadonlyMap<string, number>
  start?: { view: CommentView; commentId: string } | null
  canVary?: boolean
}) {
  const [space, setSpace] = useState<Size | null>(null)
  const [state, setState] = useState<ViewportState>(() =>
    start ? stateFromView(start.view) : readViewport(readStored(STORAGE_KEY), board),
  )
  const [zoom, setZoom] = useState<ZoomMode>(() => readZoom(readStored(ZOOM_KEY)))
  const [commenting, setCommenting] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [panelOpen, setPanelOpen] = useState(start !== null)
  const [activeId, setActiveId] = useState<string | null>(start?.commentId ?? null)
  const [dragScale, setDragScale] = useState<number | null>(null)
  const frameKey = `${board.name}:${reload}`
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [scroll, setScroll] = useState({ key: frameKey, x: 0, y: 0 })
  const frameRef = useRef<HTMLIFrameElement>(null)
  const drag = useRef<Drag | null>(null)
  const pick = picked?.pick ?? null
  const dragging = dragScale !== null
  const pending = useRef(start?.commentId ?? null)

  const boardKey = `${board.name}:${board.width}:${board.height}`
  const [seenBoard, setSeenBoard] = useState(boardKey)
  if (seenBoard !== boardKey) {
    setSeenBoard(boardKey)
    if (state.preset === 'fit' || state.preset === 'board') {
      setState(presetState(state.preset, board))
    }
  }

  // Syncs with the stage's size, an external system: the board refits when the window changes.
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpace({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fillFit = board.fill === true && state.preset === 'fit'
  const shown: ViewportState = fillFit
    ? { ...state, width: Math.round(space?.width ?? 0), height: Math.round(space?.height ?? 0) }
    : state
  const k = fillFit ? 1 : (dragScale ?? (space ? zoomScale(zoom, shown, space) : 0))
  const visible = fillFit || k > 0
  const boxWidth = shown.width * k
  const boxHeight = shown.height * k
  const responsive = state.preset === 'responsive'
  const ready = readyKey === frameKey

  const latest = useRef(shown)
  useEffect(() => {
    latest.current = shown
  })

  const change = (next: ViewportState) => {
    setState(next)
    setPicked(null)
    store(STORAGE_KEY, writeViewport(next))
  }

  const changeZoom = (next: ZoomMode) => {
    setZoom(next)
    store(ZOOM_KEY, next)
  }

  const setComment = (on: boolean) => {
    setCommenting(on)
    if (on) setPanelOpen(true)
    else setPicked(null)
  }

  const onPick = useCallback(
    (next: PickedElement) => {
      if (next.board !== board.name) return
      setPicked({ pick: next, view: viewOf(latest.current, next.scroll ?? { x: 0, y: 0 }) })
    },
    [board.name],
  )
  useCommentMode(commenting, null, onPick)

  // Syncs with the frame window, an external system: it announces `ready` once the board is drawn.
  useEffect(() => {
    const onMessage = (event: MessageEvent<{ type?: unknown }>) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'ready') return
      if (event.source !== frameRef.current?.contentWindow) return
      setReadyKey(frameKey)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameKey])

  // Syncs the frame's scroll position, an external system: the comment the view opened for is shown once.
  useEffect(() => {
    if (!ready || pending.current === null) return
    const comment = thread.comments.find((candidate) => candidate.id === pending.current)
    if (!comment) return
    pending.current = null
    scrollFrameTo(frameRef.current?.contentWindow, comment)
  }, [ready, thread.comments])

  const locate = (comment: Comment) => {
    setActiveId(comment.id)
    if (comment.board !== board.name) {
      setPanelOpen(true)
      return
    }
    const { view } = comment
    if (view && (view.width !== shown.width || view.height !== shown.height)) {
      setState(stateFromView(view))
      setPicked(null)
    }
    requestAnimationFrame(() => scrollFrameTo(frameRef.current?.contentWindow, comment))
  }

  const openThread = useCallback((id: string) => {
    setActiveId(id)
    setPanelOpen(true)
  }, [])

  const escape = () => (commenting ? setComment(false) : onClose())

  // Syncs with the frame window, an external system: it has the keyboard, so it forwards Esc and C.
  useEffect(() => {
    const onMessage = (event: MessageEvent<{ type?: unknown }>) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      const message = event.data as { type?: unknown; details?: { x?: unknown; y?: unknown } }
      if (message.type === 'escape') escape()
      else if (message.type === 'comment-key') setComment(!commenting)
      else if (
        message.type === 'scroll' &&
        typeof message.details?.x === 'number' &&
        typeof message.details.y === 'number'
      ) {
        setScroll({ key: frameKey, x: message.details.x, y: message.details.y })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  // Syncs with the window keyboard, an external system: focus can sit on the page after a comment is saved.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement
      if (insideMenu(target)) return
      if (event.key === 'Escape') {
        if (target.closest('textarea')) return
        event.preventDefault()
        escape()
        return
      }
      if (event.key.toLowerCase() !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return
      if (typing(target)) return
      event.preventDefault()
      setComment(!commenting)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const startDrag = (axis: Axis) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || k <= 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      width: shown.width,
      height: shown.height,
      k,
      axis,
      last: null,
    }
    setDragScale(k)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    const next = withSize(
      state,
      current.axis.x ? current.width + (event.clientX - current.x) / current.k : current.width,
      current.axis.y ? current.height + (event.clientY - current.y) / current.k : current.height,
    )
    current.last = next
    setState(next)
    setPicked(null)
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    drag.current = null
    setDragScale(null)
    if (current.last) store(STORAGE_KEY, writeViewport(current.last))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const grip = (name: string, axis: Axis, className: string, style: CSSProperties) => (
    <div
      key={name}
      aria-hidden="true"
      className={`${GRIP} ${className}`}
      style={style}
      onPointerDown={startDrag(axis)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )

  const offset = useMemo(
    () => (scroll.key === frameKey ? { x: scroll.x, y: scroll.y } : { x: 0, y: 0 }),
    [scroll, frameKey],
  )
  const viewport = useMemo(
    () => ({ width: shown.width, height: shown.height }),
    [shown.width, shown.height],
  )
  const pinBoards = useMemo(
    () => [{ ...board, x: 0, y: 0, width: boxWidth, height: boxHeight }],
    [board, boxWidth, boxHeight],
  )
  const atBoardSize = shown.width === board.width && shown.height === board.height
  const boardComments = useMemo(
    () =>
      thread.comments
        .filter(
          (comment) =>
            comment.board === board.name &&
            (comment.view !== undefined || atBoardSize),
        )
        .map((comment) => ({ ...comment, rect: scaled(comment.rect, k, offset) })),
    [thread.comments, board.name, atBoardSize, k, offset],
  )
  const shownPick = useMemo(
    () => (pick ? { ...pick, rect: scaled(pick.rect, k, offset) } : null),
    [pick, k, offset],
  )

  const iframeStyle: CSSProperties = fillFit
    ? { pointerEvents: dragging ? 'none' : undefined }
    : {
        left: 0,
        width: shown.width,
        height: shown.height,
        transform: `scale(${k})`,
        pointerEvents: dragging ? 'none' : undefined,
      }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${board.title || board.name}`}
      className="fixed inset-0 z-40 flex flex-col bg-surface"
    >
      <header className="relative z-10 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
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
        </div>
        <ViewportBar
          state={shown}
          scale={k}
          zoom={zoom}
          zoomDisabled={fillFit}
          boardSize={{ width: board.width, height: board.height }}
          onPreset={(id) => change(presetState(id, board, shown))}
          onSize={(width, height) => change(withSize(state, width, height))}
          onRotate={() => change(rotate(state))}
          onZoom={changeZoom}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<MessageSquare className="size-4" />}
            aria-pressed={commenting}
            aria-keyshortcuts="C"
            className={commenting ? 'bg-secondary' : ''}
            onClick={() => setComment(!commenting)}
          >
            Comment
          </Button>
          <span className="shrink-0 text-xs text-muted-foreground">Esc to stop</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div
          ref={measure}
          className={`relative flex min-w-0 flex-1 ${fillFit ? 'overflow-hidden' : 'overflow-auto'}`}
        >
          {visible ? (
            <div
              className={
                fillFit
                  ? 'absolute inset-0'
                  : 'm-auto flex min-h-0 shrink-0 flex-col items-center p-6 pb-0'
              }
            >
              <div
                data-board={board.name}
                className={fillFit ? 'relative size-full' : 'relative shrink-0'}
                style={fillFit ? undefined : { width: boxWidth, height: boxHeight }}
              >
                <div
                  className={`relative size-full overflow-hidden bg-white ${fillFit ? '' : SHADOW}`}
                  style={{ borderRadius: radiusOf(state.preset, fillFit) }}
                >
                  <iframe
                    ref={frameRef}
                    key={frameKey}
                    src={`/b/${encodeURIComponent(board.name)}`}
                    title={board.name}
                    sandbox="allow-scripts allow-same-origin"
                    className={`block border-0 bg-white ${
                      fillFit ? 'absolute inset-0 size-full' : 'absolute top-0 origin-top-left'
                    }`}
                    style={iframeStyle}
                    onLoad={(event) => event.currentTarget.contentWindow?.focus()}
                  />
                </div>
                {responsive
                  ? [
                      grip('width', { x: true, y: false }, 'h-12 w-1.5 cursor-ew-resize', {
                        right: -14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }),
                      grip('height', { x: false, y: true }, 'h-1.5 w-12 cursor-ns-resize', {
                        left: '50%',
                        bottom: -14,
                        transform: 'translateX(-50%)',
                      }),
                      grip('corner', { x: true, y: true }, 'size-2.5 cursor-nwse-resize', {
                        right: -14,
                        bottom: -14,
                      }),
                    ]
                  : null}
                <div dir="ltr" className="pointer-events-none absolute inset-0 overflow-hidden">
                  <CommentLayer
                    boards={pinBoards}
                    comments={boardComments}
                    numbers={numbers}
                    activeId={activeId}
                    onOpen={openThread}
                    viewport={viewport}
                  />
                  {commenting && picked && pick && shownPick ? (
                    <div className="pointer-events-auto">
                      <FrameComposer
                        canVary={canVary}
                        key={`${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
                        size={{ width: boxWidth, height: boxHeight }}
                        pick={shownPick}
                        page={page}
                        onSent={() => setPicked(null)}
                        onSave={async (body, images) => {
                          await thread.create({
                            ...pick,
                            page,
                            view: picked.view,
                            body,
                            images,
                          })
                          setPicked(null)
                        }}
                        onCancel={() => setPicked(null)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              {fillFit ? null : (
                <p
                  className={`m-0 text-xs text-muted-foreground tabular-nums ${
                    responsive ? 'mt-4' : 'mt-2'
                  }`}
                >
                  {presetLabel(state.preset)} · {shown.width} × {shown.height}
                </p>
              )}
            </div>
          ) : null}
        </div>
        {panelOpen ? (
          <ThreadPanel
            comments={thread.comments}
            numbers={numbers}
            activeId={activeId}
            error={thread.error}
            viewport={viewport}
            onClose={() => setPanelOpen(false)}
            onLocate={locate}
            onEdit={thread.edit}
            onDelete={thread.remove}
            onResolve={thread.resolve}
            onReply={thread.reply}
            onSend={thread.send}
          />
        ) : null}
      </div>
    </div>
  )
}
