'use client'

// The viewport is a custom pan/zoom widget: it needs focus and pointer handlers for its shortcuts.
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */

import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
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
import { NO_SELECTION, reduceSelection } from './selection'
import { Sidebar } from './sidebar'
import { type Tool, Toolbar } from './toolbar'
import type { PageManifest, PageSummary } from './types'
import { useFrameEscape } from './use-frame-escape'
import { useMounts } from './use-mounts'
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
}: {
  manifest: PageManifest
  pages: PageSummary[]
  focus: string | null
}) {
  const layout = useMemo(() => buildPageLayout(manifest), [manifest])
  const order = useMemo(() => readingOrder(layout.boards), [layout])
  const placed = useMemo(() => new Set(layout.boards.map((board) => board.name)), [layout])
  const [selection, dispatch] = useReducer(reduceSelection, NO_SELECTION)
  const [tool, setTool] = useState<Tool>('move')
  const [hovered, setHovered] = useState<string | null>(null)
  const [pick, setPick] = useState<PickedElement | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [minimap, setMinimap] = useState(readMinimap)
  const searchRef = useRef<HTMLInputElement>(null)
  const mounts = useMounts(layout.boards)
  const onTap = useCallback(
    (name: string | null, double: boolean) =>
      dispatch(double && name ? { type: 'interact', name } : { type: 'select', name }),
    [],
  )
  const { camera, view, viewportRef, worldRef, handlers, actions, setSpace } = useViewport({
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
  useEvents({ onBoard: reloads.reload, onComments: comments.refetch })
  useCommentMode(commenting, camera, setPick)
  useFrameEscape(() => {
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
  const focusBoard = useCallback(
    (name: string) => {
      dispatch({ type: 'select', name })
      actions.focusBoard(name)
    },
    [actions],
  )
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
        if (!selection.name) return
        dispatch({ type: 'interact' })
        document
          .querySelector<HTMLIFrameElement>(`[data-board="${CSS.escape(selection.name)}"] iframe`)
          ?.contentWindow?.focus()
      },
      escape: () => (commenting ? changeTool('move') : dispatch({ type: 'escape' })),
      search: () => searchRef.current?.focus(),
      'tool-move': () => changeTool('move'),
      'tool-hand': () => changeTool('hand'),
      'tool-comment': () => changeTool(commenting ? 'move' : 'comment'),
    }
  }, [actions, changeTool, commenting, focusBoard, order, selection.name])
  useShortcuts(commands, setSpace)

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
          onPointerOver={(event) => event.buttons === 0 && setHovered(boardOf(event.target))}
          onPointerLeave={() => setHovered(null)}
        >
          <PageLabel title={manifest.title} k={view.k} />
          {layout.boards.map((board) => {
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
              />
            )
          })}
          <CommentLayer
            boards={layout.boards}
            comments={comments.comments}
            numbers={numbers}
            activeId={activeComment}
            onOpen={openThread}
          />
        </div>
        <Overlay
          camera={camera}
          boards={layout.boards}
          hovered={hovered}
          selected={selection.name}
        />
        {commenting && pick ? (
          <Composer
            key={`${pick.board}:${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
            camera={camera}
            boards={layout.boards}
            pick={pick}
            onSave={async (body) => {
              await comments.create({ ...pick, page: manifest.id, body })
              setPick(null)
            }}
            onCancel={() => setPick(null)}
          />
        ) : null}
        <Toolbar tool={tool} onTool={changeTool} />
        <ViewControls
          camera={camera}
          layout={layout}
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
          onSend={comments.send}
        />
      ) : selectedBoard ? (
        <Inspector
          board={selectedBoard}
          pageId={manifest.id}
          pages={pages}
          placed={placed}
          onFocusBoard={focusBoard}
        />
      ) : null}
    </div>
  )
}
