'use client'

// The viewport is a custom pan/zoom widget: it needs focus and pointer handlers for its shortcuts.
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CommentLayer } from './comments/comment-layer'
import { Composer } from './comments/composer'
import { numberComments } from './comments/model'
import { ThreadPanel } from './comments/thread-panel'
import type { Comment, PickedElement } from './comments/types'
import { useBoardReloads } from './comments/use-board-reloads'
import { useCommentMode } from './comments/use-comment-mode'
import { useComments } from './comments/use-comments'
import { useEvents } from './comments/use-events'
import { Frame } from './frame'
import { buildPageLayout } from './geometry'
import { Inspector } from './inspector'
import { isVisible } from './mount-policy'
import { adjacentBoard, readingOrder } from './navigation'
import { Overlay } from './overlay'
import { PageLabel } from './page-label'
import { PlayView } from './play-view'
import { NO_SELECTION, reduceSelection, type Selection } from './selection'
import { Sidebar } from './sidebar'
import { Toast, useNotice } from './toast'
import { type Tool, Toolbar } from './toolbar'
import type { PageManifest, PageSummary } from './types'
import { useBoardEditing } from './use-board-editing'
import { useBoardLayout } from './use-board-layout'
import { useFrameEscape } from './use-frame-escape'
import { useMounts } from './use-mounts'
import {
  findBoardPage,
  linkProblem,
  type PlayMode,
  playHref,
  usePlayFlags,
  usePlayLinks,
} from './use-play-links'
import { type CommandHandlers, useShortcuts } from './use-shortcuts'
import { useViewport } from './use-viewport'
import { ViewControls } from './view-controls'
import { readMinimap, writeMinimap } from './view-storage'

const GRID_STYLE = {
  backgroundColor: 'var(--surface)',
  backgroundImage:
    'radial-gradient(circle, color-mix(in srgb, var(--border-strong) calc(var(--grid-alpha, 0) * 1%), transparent) 1px, transparent 1.5px)',
  backgroundSize: 'var(--grid-size, 24px) var(--grid-size, 24px)',
  backgroundPosition: 'var(--grid-x, 0) var(--grid-y, 0)',
} as const

const boardOf = (target: EventTarget) =>
  (target as HTMLElement).closest('[data-board]')?.getAttribute('data-board') ?? null

/** One page's world. Pan and zoom run outside React (`useViewport`); frames follow the committed view only. */
export function PageCanvas({
  manifest,
  pages,
  focus,
  play = null,
}: {
  manifest: PageManifest
  pages: PageSummary[]
  focus: string | null
  /** From `?play=`: start with `focus` playing on the canvas or full screen. */
  play?: PlayMode | null
}) {
  const layout = useMemo(() => buildPageLayout(manifest), [manifest])
  const edit = useBoardLayout(manifest.id, layout.boards)
  const boards = edit.boards
  const order = useMemo(() => readingOrder(boards), [boards])
  const onPage = useMemo(() => new Set(boards.map((board) => board.name)), [boards])
  const [selection, dispatch] = useReducer(
    reduceSelection,
    play === 'canvas' && focus ? { name: focus, interacting: true } : NO_SELECTION,
    (initial: Selection) => initial,
  )
  const [fullPlay, setFullPlay] = useState<string | null>(play === 'full' ? focus : null)
  const [notice, setNotice] = useNotice()
  const router = useRouter()
  const [tool, setTool] = useState<Tool>('move')
  const [hovered, setHovered] = useState<string | null>(null)
  const [pick, setPick] = useState<PickedElement | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [minimap, setMinimap] = useState(readMinimap)
  const searchRef = useRef<HTMLInputElement>(null)
  const mounts = useMounts(boards)
  const onTap = useCallback(
    (name: string | null, double: boolean) =>
      dispatch(double && name ? { type: 'interact', name } : { type: 'select', name }),
    [],
  )
  const {
    camera,
    view,
    viewportRef,
    worldRef,
    handlers,
    actions: cameraActions,
    setSpace,
  } = useViewport({
    layout,
    pageId: manifest.id,
    focus,
    hand: tool === 'hand',
    onCommit: mounts.update,
    onTap,
  })
  const comments = useComments(manifest.id)
  const reloads = useBoardReloads()
  const numbers = useMemo(() => numberComments(comments.comments), [comments.comments])
  const commenting = tool === 'comment'
  const playFlags = usePlayFlags(manifest.id)
  const { reload: reloadBoard } = reloads
  const { refresh: refreshFlags } = playFlags
  // A changed board may gain or lose its handlers and links, so its Play chip is read again.
  const onBoardChange = useCallback(
    (name: string) => {
      reloadBoard(name)
      refreshFlags()
    },
    [reloadBoard, refreshFlags],
  )
  useEvents({ onBoard: onBoardChange, onComments: comments.refetch })
  useCommentMode(commenting, camera, setPick)
  useFrameEscape(() => {
    if (fullPlay) {
      closeFullPlay()
      return
    }
    dispatch({ type: 'escape' })
    setPick(null)
    setTool((current) => (current === 'comment' ? 'move' : current))
    camera.focusViewport()
  })

  const changeTool = useCallback((next: Tool) => {
    setTool(next)
    setPick(null)
    if (next === 'comment') setPanelOpen(true)
  }, [])
  const openThread = useCallback((id: string) => {
    setActiveComment(id)
    setPanelOpen(true)
  }, [])

  const select = useCallback((name: string) => dispatch({ type: 'select', name }), [])
  const moving = tool === 'move'
  const { placedLayout, selectedRect, frameEdit, actions, nudges } = useBoardEditing({
    camera,
    cameraActions,
    edit,
    selection,
    moving,
    onSelect: select,
  })
  const focusBoard = useCallback(
    (name: string) => {
      dispatch({ type: 'select', name })
      actions.focusBoard(name)
    },
    [actions],
  )
  // The frame takes the keyboard itself once it plays and is ready (see `Frame`).
  const playOnCanvas = useCallback((name: string) => {
    setTool('move')
    setPick(null)
    dispatch({ type: 'interact', name })
  }, [])
  const playBoard = useCallback(
    (name: string, mode: PlayMode) => (mode === 'full' ? setFullPlay(name) : playOnCanvas(name)),
    [playOnCanvas],
  )
  const playFull = useCallback((name: string) => setFullPlay(name), [])
  const stopPlay = select
  /** Back to the canvas on the board that was playing last, so a walk through a flow ends there. */
  const closeFullPlay = useCallback(() => {
    if (fullPlay) focusBoard(fullPlay)
    setFullPlay(null)
  }, [focusBoard, fullPlay])
  // Bumped whenever what plays changes, so a slow cross-page lookup that Stop or Esc overtook
  // does not move the page afterwards.
  const playRun = useRef(0)
  const playing = fullPlay ?? (selection.interacting ? selection.name : null)
  useEffect(() => {
    playRun.current += 1
  }, [playing])
  // A link in a played board moves Play to its target: in place on this page, else on its page.
  usePlayLinks((from, target) => {
    const full = fullPlay === from
    if (playing !== from) return
    if (onPage.has(target)) {
      if (full) {
        setFullPlay(target)
        return
      }
      playOnCanvas(target)
      actions.focusBoard(target)
      return
    }
    const run = playRun.current
    findBoardPage(target)
      .then((page) => {
        if (run !== playRun.current) return
        if (page) router.push(playHref(page, target, full ? 'full' : 'canvas'))
        else setNotice(linkProblem(target))
      })
      .catch((error: unknown) => run === playRun.current && setNotice(linkProblem(target, error)))
  })

  const locate = (comment: Comment) => {
    setActiveComment(comment.id)
    actions.focusBoard(comment.board)
  }
  const selectedBoard = manifest.boards.find((board) => board.name === selection.name)
  const toggleMinimap = () => {
    writeMinimap(!minimap)
    setMinimap(!minimap)
  }

  const commands = useMemo<CommandHandlers>(() => {
    const step = (direction: 1 | -1) => {
      const next = adjacentBoard(order, selection.name, direction)
      if (next) focusBoard(next)
    }
    const fitSelection = () => selection.name && actions.focusBoard(selection.name)
    return {
      'fit-page': actions.fit,
      'fit-selection': fitSelection,
      'actual-size': actions.actualSize,
      'zoom-in': () => actions.zoomStep(1),
      'zoom-out': () => actions.zoomStep(-1),
      'next-board': () => step(1),
      'previous-board': () => step(-1),
      interact: () => {
        if (selection.name) dispatch({ type: 'interact' })
      },
      escape: () => (commenting ? changeTool('move') : dispatch({ type: 'escape' })),
      search: () => searchRef.current?.focus(),
      'tool-move': () => changeTool('move'),
      'tool-hand': () => changeTool('hand'),
      'tool-comment': () => changeTool(commenting ? 'move' : 'comment'),
      ...nudges,
    }
  }, [actions, changeTool, commenting, focusBoard, nudges, order, selection.name])
  // Boards with the flags read again after a change; the same objects when nothing changed.
  const shown = useMemo(
    () =>
      boards.map((board) => {
        const flags = playFlags.flags.get(board.name)
        return flags && (flags.interactive !== board.interactive || flags.fill !== board.fill)
          ? { ...board, ...flags }
          : board
      }),
    [boards, playFlags.flags],
  )
  const byName = useMemo(() => new Map(shown.map((board) => [board.name, board])), [shown])
  const ordered = useMemo(
    () => order.map((name) => byName.get(name)).filter((board) => board !== undefined),
    [byName, order],
  )
  const fullBoard = fullPlay ? byName.get(fullPlay) : undefined
  const playCommands = useMemo<CommandHandlers>(() => ({ escape: closeFullPlay }), [closeFullPlay])
  // Full screen play owns the keyboard: only Esc, which closes it. A name with no board on this
  // page shows no view, so the canvas keeps its shortcuts.
  useShortcuts(fullBoard ? playCommands : commands, setSpace)

  return (
    <div className="flex h-screen">
      <Sidebar
        pages={pages}
        pageId={manifest.id}
        boards={manifest.boards}
        selected={selection.name}
        searchRef={searchRef}
        onFocusBoard={focusBoard}
      />
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Design canvas"
        {...handlers}
        className={`relative min-w-0 flex-1 touch-none overflow-hidden outline-none select-none ${
          tool === 'hand' ? 'cursor-grab' : ''
        }`}
        style={GRID_STYLE}
      >
        <div
          ref={worldRef}
          data-hand={tool === 'hand' ? '' : undefined}
          className="absolute start-0 top-0 origin-top-left"
          onPointerDown={frameEdit.onTitleDown}
          onPointerOver={(event) => event.buttons === 0 && setHovered(boardOf(event.target))}
          onPointerLeave={() => setHovered(null)}
        >
          <PageLabel title={manifest.title} k={view.k} />
          {shown.map((board) => {
            const entry = mounts.state.entries[board.name]
            return (
              <Frame
                key={board.name}
                board={board}
                mounted={Boolean(entry?.mounted)}
                hidden={!isVisible(mounts.state, board.name)}
                report={entry?.report}
                interacting={selection.interacting && selection.name === board.name}
                commenting={commenting}
                reload={reloads.counters[board.name] ?? 0}
                onSelect={select}
                onPlay={playBoard}
                onStop={stopPlay}
              />
            )
          })}
          <CommentLayer
            boards={boards}
            comments={comments.comments}
            numbers={numbers}
            activeId={activeComment}
            onOpen={openThread}
          />
        </div>
        <Overlay
          camera={camera}
          boards={boards}
          hovered={hovered}
          selected={selection.name}
          editable={moving && !selection.interacting}
          onResizeStart={frameEdit.onResizeDown}
        />
        {commenting && pick ? (
          <Composer
            key={`${pick.board}:${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
            camera={camera}
            boards={boards}
            pick={pick}
            onSave={async (body, images) => {
              await comments.create({ ...pick, page: manifest.id, body, images })
              setPick(null)
            }}
            onCancel={() => setPick(null)}
          />
        ) : null}
        <Toolbar tool={tool} onTool={changeTool} boards={ordered} onPlay={playFull} />
        <Toast message={edit.error ?? notice} />
        <ViewControls
          camera={camera}
          layout={placedLayout}
          k={view.k}
          actions={actions}
          selected={selection.name}
          onFitSelection={commands['fit-selection'] ?? (() => {})}
          minimap={minimap}
          onToggleMinimap={toggleMinimap}
        />
      </div>
      {panelOpen ? (
        <ThreadPanel
          comments={comments.comments}
          numbers={numbers}
          activeId={activeComment}
          error={comments.error}
          onClose={() => setPanelOpen(false)}
          onLocate={locate}
          onEdit={comments.edit}
          onDelete={comments.remove}
          onResolve={comments.resolve}
          onReply={comments.reply}
          onSend={comments.send}
        />
      ) : selectedBoard ? (
        <Inspector
          board={{ ...selectedBoard, ...selectedRect }}
          pageId={manifest.id}
          pages={pages}
          placed={onPage}
          onFocusBoard={focusBoard}
        />
      ) : null}
      {fullBoard ? (
        <PlayView
          board={fullBoard}
          reload={reloads.counters[fullBoard.name] ?? 0}
          onClose={closeFullPlay}
        />
      ) : null}
    </div>
  )
}
