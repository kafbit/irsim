'use client'

// The viewport is a custom pan/zoom widget: it needs focus and pointer handlers for its shortcuts.
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ApproveBox } from './approvals/approve-box'
import { useApprovals } from './approvals/use-approvals'
import { CommentLayer } from './comments/comment-layer'
import { Composer } from './comments/composer'
import { boardPick, numberComments, placedRect } from './comments/model'
import { ThreadPanel } from './comments/thread-panel'
import type { Comment, CommentView, PickedElement } from './comments/types'
import { useBoardReloads } from './comments/use-board-reloads'
import { useCommentMode } from './comments/use-comment-mode'
import { useComments } from './comments/use-comments'
import { useEvents } from './comments/use-events'
import { Frame } from './frame'
import { GlobalSearch } from './global-search'
import { editsOf, type Move } from './frame-edit'
import { boardsInRect, buildPageLayout, type Rect } from './geometry'
import { Inspector, InspectorMulti } from './inspector'
import { Marquee } from './marquee'
import { noticeFor } from './history'
import { isVisible } from './mount-policy'
import { adjacentBoard, readingOrder } from './navigation'
import { Overlay } from './overlay'
import { PlayView } from './play-view'
import { NO_SELECTION, reduceSelection, type Selection } from './selection'
import {
  assignEdits,
  colorEdits,
  createSectionEdits,
  deleteSectionEdits,
  moveSectionEdits,
  resizeSectionEdits,
  placedSections,
  renameEdits,
  withMembership,
} from './sections'
import { SectionLayer } from './section-layer'
import { SettingsDialog } from './settings-dialog'
import { Sidebar } from './sidebar'
import { pendingOf, TopBar } from './top-bar'
import { FocusBar } from './focus-bar'
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
import { readMinimap, writeMinimap, readSidebar, writeSidebar} from './view-storage'

const GRID_STYLE = {
  backgroundColor: 'var(--surface)',
  backgroundImage:
    'radial-gradient(circle, color-mix(in srgb, var(--border-strong) calc(var(--grid-alpha, 0) * 1%), transparent) 1px, transparent 1.5px)',
  backgroundSize: 'var(--grid-size, 24px) var(--grid-size, 24px)',
  backgroundPosition: 'var(--grid-x, 0) var(--grid-y, 0)',
} as const

type InspectorProps = Parameters<typeof Inspector>[0]

type MultiProps = Parameters<typeof InspectorMulti>[0]

/** Where the inspector is mounted: one board gets the full inspector, two or more get the multi-selection one. */
function InspectorHost({
  selectedNames,
  board,
  multi,
  ...rest
}: Omit<InspectorProps, 'board'> & {
  selectedNames: string[]
  board: InspectorProps['board'] | undefined
  multi: Omit<MultiProps, 'names'>
}) {
  if (selectedNames.length > 1) return <InspectorMulti names={selectedNames} {...multi} />
  if (selectedNames.length !== 1 || !board) return null
  return <Inspector board={board} {...rest} />
}

const boardOf = (target: EventTarget) =>
  (target as HTMLElement).closest('[data-board]')?.getAttribute('data-board') ?? null

/** One page's world. Pan and zoom run outside React (`useViewport`); frames follow the committed view only. */
export function PageCanvas({
  manifest,
  pages,
  focus,
  play = null,
  onCanvasChange,
}: {
  manifest: PageManifest
  pages: PageSummary[]
  focus: string | null
  /** Runs when `canvas.json` changed on the server; the parent fetches the manifest again. Must be stable. */
  onCanvasChange?: () => void
  /** From `?play=`: start with `focus` playing on the canvas or full screen. */
  play?: PlayMode | null
}) {
  const layout = useMemo(() => buildPageLayout(manifest), [manifest])
  const edit = useBoardLayout(manifest.id, layout.boards, manifest.sections)
  const boards = edit.boards
  const order = useMemo(() => readingOrder(boards), [boards])
  const onPage = useMemo(() => new Set(boards.map((board) => board.name)), [boards])
  const [selection, dispatch] = useReducer(
    reduceSelection,
    play === 'canvas' && focus ? { names: [focus], interacting: true } : NO_SELECTION,
    (initial: Selection) => initial,
  )
  const [fullPlay, setFullPlay] = useState<string | null>(play === 'full' ? focus : null)
  const [playStart, setPlayStart] = useState<{ view: CommentView; commentId: string } | null>(null)
  const [notice, setNotice] = useNotice()
  const router = useRouter()
  const [tool, setTool] = useState<Tool>('move')
  const [hovered, setHovered] = useState<string | null>(null)
  const [pick, setPick] = useState<PickedElement | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [minimap, setMinimap] = useState(readMinimap)
  const [sidebarShown, setSidebarShown] = useState(readSidebar)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const mounts = useMounts(boards)
  const [marqueeRect, setMarquee] = useState<Rect | null>(null)
  const cameraRef = useRef<{ view: { x: number; y: number; k: number } } | null>(null)
  const marqueeBase = useRef<string[]>([])
  const latest = useRef({ selection, boards })
  useEffect(() => {
    latest.current = { selection, boards }
  })
  const onMarquee = useCallback((rect: Rect | null, additive: boolean, start: boolean) => {
    setMarquee(rect)
    const view = cameraRef.current?.view
    if (!rect || !view) return
    if (start) marqueeBase.current = additive ? latest.current.selection.names : []
    const world = {
      x: (rect.x - view.x) / view.k,
      y: (rect.y - view.y) / view.k,
      width: rect.width / view.k,
      height: rect.height / view.k,
    }
    const names = boardsInRect(world, latest.current.boards)
    dispatch({ type: 'set', names: [...marqueeBase.current, ...names] })
  }, [])
  const onTap = useCallback((name: string | null, double: boolean, additive: boolean) => {
    if (name === null) return additive ? undefined : dispatch({ type: 'select', name: null })
    if (double) return dispatch({ type: 'interact', name })
    dispatch(additive ? { type: 'toggle', name } : { type: 'select', name })
  }, [])
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
    marquee: tool === 'move',
    onCommit: mounts.update,
    onTap,
    onMarquee,
  })
  useEffect(() => {
    cameraRef.current = camera
  })
  const comments = useComments(manifest.id)
  const reloads = useBoardReloads()
  const numbers = useMemo(() => numberComments(comments.comments), [comments.comments])
  const commenting = tool === 'comment'
  const playFlags = usePlayFlags(manifest.id)
  const approvals = useApprovals(manifest.id)
  const { reload: reloadBoard } = reloads
  const { refresh: refreshFlags } = playFlags
  const { refetch: refetchApprovals } = approvals
  // A changed board may gain or lose its handlers and links, so its Play chip is read again, and
  // an approval of it may no longer hold.
  const onBoardChange = useCallback(
    (name: string) => {
      reloadBoard(name)
      refreshFlags()
      void refetchApprovals()
    },
    [reloadBoard, refreshFlags, refetchApprovals],
  )
  const [thumbs, setThumbs] = useState<Record<string, { rev: number; ok: boolean }>>({})
  const onThumb = useCallback((name: string, ok: boolean) => {
    setThumbs((prev) => ({ ...prev, [name]: { rev: (prev[name]?.rev ?? 0) + 1, ok } }))
  }, [])
  useEvents({
    onBoard: onBoardChange,
    onComments: comments.refetch,
    onApprovals: refetchApprovals,
    onThumb,
    ...(onCanvasChange ? { onCanvas: onCanvasChange } : {}),
  })
  useCommentMode(commenting, camera, setPick)
  useFrameEscape(() => {
    if (fullPlay) return
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
  const selectBoards = useCallback(
    (names: string[], additive = false) => dispatch({ type: additive ? 'add' : 'set', names }),
    [],
  )
  const clickFrame = useCallback(
    (name: string, additive: boolean) =>
      dispatch(additive ? { type: 'toggle', name } : { type: 'select', name }),
    [],
  )
  const moving = tool === 'move'
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // The sections as they were when a drag started: read through a ref so the callback is stable.
  const dragState = useRef({ boards: edit.boards, sections: edit.sections })
  useEffect(() => {
    dragState.current = { boards: edit.boards, sections: edit.sections }
  })
  const dropAreas = useCallback(
    () => placedSections(dragState.current.sections, dragState.current.boards),
    [],
  )
  const { placedLayout, selectedRect, frameEdit, actions, nudges } = useBoardEditing({
    camera,
    cameraActions,
    edit,
    selection,
    moving,
    onSelect: select,
    dropAreas,
    onTarget: setDropTarget,
  })
  const focusBoard = useCallback(
    (name: string) => {
      dispatch({ type: 'select', name })
      actions.focusBoard(name)
    },
    [actions],
  )
  const { sections, sectionOf, editSections } = edit
  const placedSectionList = useMemo(
    () => placedSections(sections, boards),
    [sections, boards],
  )
  const toggleSidebar = useCallback(() => {
    setSidebarShown((shown) => {
      writeSidebar(!shown)
      return !shown
    })
  }, [])
  const latestEdit = useRef({ boards, sections })
  useEffect(() => {
    latestEdit.current = { boards, sections }
  })
  const createSection = useCallback(
    (names: string[], nested = true) => {
      if (names.length === 0) return
      const current = latestEdit.current
      const { section, before, after } = createSectionEdits(
        names,
        current.boards,
        current.sections,
        nested,
      )
      editSections('new section', before, after)
      setRenaming(section.id)
    },
    [editSections],
  )
  const renameSection = useCallback(
    (id: string, title: string | null) => {
      setRenaming(null)
      camera.focusViewport()
      const section = latestEdit.current.sections.find((candidate) => candidate.id === id)
      const next = title?.trim()
      if (!section || !next || next === section.title) return
      const { before, after } = renameEdits(section, next)
      editSections(`rename of ${section.title}`, before, after)
    },
    [camera, editSections],
  )
  const deleteSection = useCallback(
    (id: string) => {
      const current = latestEdit.current
      const section = current.sections.find((candidate) => candidate.id === id)
      if (!section) return
      const { before, after } = deleteSectionEdits(section, current.boards, current.sections)
      editSections(`delete of ${section.title}`, before, after)
    },
    [editSections],
  )
  const colorSection = useCallback(
    (id: string, color: 'gray' | 'blue' | 'green' | 'amber' | 'purple' | 'red' | null) => {
      const section = latestEdit.current.sections.find((candidate) => candidate.id === id)
      if (!section || (section.color ?? null) === color) return
      const { before, after } = colorEdits(section, color)
      editSections(`color of ${section.title}`, before, after)
    },
    [editSections],
  )
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const resizeSection = useCallback(
    (id: string, rect: Rect) => {
      const section = latestEdit.current.sections.find((candidate) => candidate.id === id)
      if (!section) return
      const { before, after } = resizeSectionEdits(section, rect)
      editSections(`resize of ${section.title}`, before, after)
    },
    [editSections],
  )
  const moveSection = useCallback(
    (id: string, moves: Move[], label: string) => {
      const [first] = moves
      const stored = first
        ? moveSectionEdits(
            id,
            latestEdit.current.sections,
            first.rect.x - first.before.x,
            first.rect.y - first.before.y,
          )
        : null
      if (!stored) return edit.commit(moves, 'move', label)
      // The boards and the stored areas move together, so one undo puts both back.
      const { before, after } = editsOf(moves)
      edit.preview(null)
      editSections(
        label,
        { ...before, ...stored.before },
        { ...after, ...stored.after },
      )
    },
    [edit, editSections],
  )
  const assignSection = useCallback(
    (names: string[], id: string | null) => {
      const current = latestEdit.current
      const { before, after } = assignEdits(names, current.boards, id)
      const [only] = names
      const title =
        names.length === 1 && only
          ? current.boards.find((board) => board.name === only)?.title || only
          : `${names.length} boards`
      editSections(`section of ${title}`, before, after)
    },
    [editSections],
  )
  const selectGlobal = useCallback(
    (names: string[]) => {
      const known = names.filter((name) => onPage.has(name))
      if (known.length === 0) return
      setFullPlay(null)
      setPlayStart(null)
      dispatch({ type: 'set', names: known })
      actions.focusBoards(known)
    },
    [actions, onPage],
  )
  // The frame takes the keyboard itself once it plays and is ready (see `Frame`).
  const playOnCanvas = useCallback((name: string) => {
    setTool('move')
    setPick(null)
    dispatch({ type: 'interact', name })
  }, [])
  const openFullPlay = useCallback(
    (name: string, start: { view: CommentView; commentId: string } | null = null) => {
      setTool('move')
      setPick(null)
      setPlayStart(start)
      setFullPlay(name)
    },
    [],
  )
  const playBoard = useCallback(
    (name: string, mode: PlayMode) => (mode === 'full' ? openFullPlay(name) : playOnCanvas(name)),
    [openFullPlay, playOnCanvas],
  )
  const playFull = useCallback((name: string) => openFullPlay(name), [openFullPlay])
  const stopPlay = select
  /** Back to the canvas on the board that was playing last, so a walk through a flow ends there. */
  const closeFullPlay = useCallback(() => {
    if (fullPlay) focusBoard(fullPlay)
    setFullPlay(null)
  }, [focusBoard, fullPlay])
  // Bumped whenever what plays changes, so a slow cross-page lookup that Stop or Esc overtook
  // does not move the page afterwards.
  const playRun = useRef(0)
  const only = selection.names.length === 1 ? (selection.names[0] ?? null) : null
  const playing = fullPlay ?? (selection.interacting ? only : null)
  useEffect(() => {
    playRun.current += 1
  }, [playing])
  // A link in a played board moves Play to its target: in place on this page, else on its page.
  usePlayLinks((from, target) => {
    const full = fullPlay === from
    if (playing !== from) return
    if (onPage.has(target)) {
      if (full) {
        setPlayStart(null)
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

  const selectedBoard = manifest.boards.find((board) => board.name === only)
  const inspectorBoard = useMemo(() => {
    if (!selectedBoard) return undefined
    const { section: _stale, ...rest } = selectedBoard
    const section = sectionOf[selectedBoard.name]
    return { ...rest, ...(section === undefined ? {} : { section }), ...selectedRect }
  }, [sectionOf, selectedBoard, selectedRect])
  const sidebarBoards = useMemo(
    () => withMembership(manifest.boards, sectionOf),
    [manifest.boards, sectionOf],
  )
  const playingOnCanvas = selection.interacting ? only : null
  const toggleMinimap = () => {
    writeMinimap(!minimap)
    setMinimap(!minimap)
  }

  const commands = useMemo<CommandHandlers>(() => {
    const step = (direction: 1 | -1) => {
      const next = adjacentBoard(order, selection.names.at(-1) ?? null, direction)
      if (next) focusBoard(next)
    }
    const fitSelection = () => {
      if (selection.names.length > 0) actions.focusBoards(selection.names)
    }
    const walk = (run: () => ReturnType<typeof edit.undo>) => {
      if (selection.interacting) return false
      void run().then((outcome) => {
        const next = noticeFor(outcome)
        if (next) setNotice(next.message, next.tone)
      })
    }
    return {
      'fit-page': actions.fit,
      'fit-selection': fitSelection,
      'actual-size': actions.actualSize,
      'zoom-in': () => actions.zoomStep(1),
      'zoom-out': () => actions.zoomStep(-1),
      'next-board': () => step(1),
      'previous-board': () => step(-1),
      interact: () => {
        if (only) dispatch({ type: 'interact' })
      },
      escape: () => (commenting ? changeTool('move') : dispatch({ type: 'escape' })),
      search: () => {
        if (searchRef.current) searchRef.current.focus()
        else setSearchOpen(true)
      },
      'global-search': () => setSearchOpen(true),
      'toggle-sidebar': () => toggleSidebar(),
      undo: () => walk(edit.undo),
      redo: () => walk(edit.redo),
      'select-all': () => {
        if (selection.interacting) return false
        dispatch({ type: 'selectAll', names: boards.map((board) => board.name) })
      },
      'create-section': () => {
        if (selection.names.length === 0 || selection.interacting) return false
        createSection(selection.names)
      },
      'tool-move': () => changeTool('move'),
      'tool-hand': () => changeTool('hand'),
      'tool-comment': () => changeTool(commenting ? 'move' : 'comment'),
      ...nudges,
    }
  }, [
    actions,
    boards,
    changeTool,
    commenting,
    createSection,
    edit.redo,
    edit.undo,
    focusBoard,
    nudges,
    only,
    order,
    selection.interacting,
    selection.names,
    setNotice,
    toggleSidebar,
  ])
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
  const locate = (comment: Comment) => {
    setActiveComment(comment.id)
    const board = byName.get(comment.board)
    if (!board) return
    if (comment.view) {
      openFullPlay(comment.board, { view: comment.view, commentId: comment.id })
      return
    }
    const rect = placedRect(board, comment)
    cameraActions.focusRect({ ...rect, x: board.x + rect.x, y: board.y + rect.y })
  }
  // Read through a ref so `commentOnBoard` stays stable while a drag changes `byName`, and the memoized frames do not re-render.
  const latestByName = useRef(byName)
  useEffect(() => {
    latestByName.current = byName
  })
  const commentOnBoard = useCallback((name: string) => {
    const board = latestByName.current.get(name)
    if (board) setPick(boardPick(board))
  }, [])
  const ordered = useMemo(
    () => order.map((name) => byName.get(name)).filter((board) => board !== undefined),
    [byName, order],
  )
  const fullBoard = fullPlay ? byName.get(fullPlay) : undefined
  const playCommands = useMemo<CommandHandlers>(() => ({}), [])
  // Full screen play owns the keyboard: the view handles Esc and C itself. A name with no board on this
  // page shows no view, so the canvas keeps its shortcuts.
  useShortcuts(fullBoard ? playCommands : commands, setSpace)

  // A section is selected while exactly its boards are: any other selection puts it away.
  const sectionSelected = useMemo(() => {
    const placed = placedSectionList.find((item) => item.section.id === selectedSection)
    if (!placed) return null
    const names = new Set(selection.names)
    return placed.members.length === names.size && placed.members.every((name) => names.has(name))
      ? placed.section.id
      : null
  }, [placedSectionList, selectedSection, selection.names])
  const pending = useMemo(
    () =>
      pendingOf(
        boards.map((board) => board.name),
        approvals.stateOf,
      ),
    [boards, approvals.stateOf],
  )
  const approveBoards = useCallback(
    async ({ boards: names, sessionId }: { boards: string[]; sessionId: string }) => {
      await approvals.approveMany({ boards: names, sessionId, note: '' })
      setNotice(`Sent ${names.length} ${names.length === 1 ? 'board' : 'boards'} to the agent`, 'info')
    },
    [approvals, setNotice],
  )

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        pageTitle={manifest.title}
        boards={boards.map((board) => board.name)}
        pending={pending}
        sidebarShown={sidebarShown}
        onToggleSidebar={toggleSidebar}
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onApprove={approveBoards}
      />
      <div className="flex min-h-0 flex-1">
      {sidebarShown ? (
        <Sidebar
          pages={pages}
          pageId={manifest.id}
          boards={sidebarBoards}
          sections={sections}
          selected={selection.names}
          searchRef={searchRef}
          onFocusBoard={focusBoard}
          onSelectBoards={selectBoards}
        />
      ) : null}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Design canvas"
        {...handlers}
        className={`relative min-w-0 flex-1 touch-none overflow-clip outline-none select-none ${
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
          <SectionLayer
            hovered={hoveredSection}
            dropTarget={dropTarget}
            onHover={setHoveredSection}
            sections={placedSectionList}
            boards={boards}
            pageId={manifest.id}
            camera={camera}
            selected={selection.names}
            renaming={renaming}
            movable={tool === 'move'}
            onSelect={selectBoards}
            onRenameStart={setRenaming}
            onRename={renameSection}
            onPreview={edit.preview}
            selectedSection={sectionSelected}
            onSelectSection={setSelectedSection}
            onMoveSection={moveSection}
            onResizeSection={resizeSection}
          />
          {shown.map((board) => {
            const entry = mounts.state.entries[board.name]
            return (
              <Frame
                key={board.name}
                board={board}
                mounted={Boolean(entry?.mounted)}
                hidden={!isVisible(mounts.state, board.name)}
                report={entry?.report}
                interacting={selection.interacting && only === board.name}
                commenting={commenting}
                reload={reloads.counters[board.name] ?? 0}
                approval={approvals.stateOf(board.name)}
                thumb={thumbs[board.name]}
                onSelect={clickFrame}
                onComment={commentOnBoard}
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
          selected={selection.names}
          editable={moving && !selection.interacting}
          onResizeStart={frameEdit.onResizeDown}
        />
        <Marquee rect={marqueeRect} />
        {commenting && pick ? (
          <Composer
            key={`${pick.board}:${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
            camera={camera}
            boards={boards}
            pick={pick}
            page={manifest.id}
            canVary={!manifest.boards.find((board) => board.name === pick.board)?.variantOf}
            onSave={async (body, images) => {
              await comments.create({ ...pick, page: manifest.id, body, images })
              setPick(null)
            }}
            onSent={(count) => {
              const title = boards.find((board) => board.name === pick.board)?.title || pick.board
              setPick(null)
              setNotice(`Sent ${count} variants of ${title} to Claude`, 'info')
            }}
            onCancel={() => setPick(null)}
          />
        ) : null}
        <Toolbar tool={tool} onTool={changeTool} boards={ordered} onPlay={playFull} />
        {playingOnCanvas ? (
          <FocusBar
            title={selectedBoard?.title || playingOnCanvas}
            onExit={() => stopPlay(playingOnCanvas)}
          />
        ) : null}
        <Toast
          message={edit.error ?? notice?.message ?? null}
          tone={edit.error ? 'error' : (notice?.tone ?? 'error')}
        />
        <ViewControls
          camera={camera}
          layout={placedLayout}
          sections={placedSectionList.map((placed) => placed.bounds)}
          k={view.k}
          actions={actions}
          selected={selection.names}
          onFitSelection={commands['fit-selection'] ?? (() => {})}
          minimap={minimap}
          onToggleMinimap={toggleMinimap}
          onOpenSettings={() => setSettingsOpen(true)}
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
      ) : selection.names.length > 0 ? (
        <InspectorHost
          selectedNames={selection.names}
          board={inspectorBoard}
          pageId={manifest.id}
          pages={pages}
          placed={onPage}
          sections={sections}
          onSection={assignSection}
          multi={{
            boards,
            sections,
            onSection: assignSection,
            onCreateSection: createSection,
            onDeleteSection: deleteSection,
            onColor: colorSection,
          }}
          onFocusBoard={focusBoard}
        >
          {selectedBoard && approvals.stateOf(selectedBoard.name) !== undefined &&
          approvals.stateOf(selectedBoard.name) !== 'approved' ? (
            <ApproveBox
              key={selectedBoard.name}
              board={selectedBoard.name}
              state={approvals.stateOf(selectedBoard.name)}
              approval={approvals.approvals.get(selectedBoard.name)}
              onApprove={approvals.approve}
            />
          ) : null}
        </InspectorHost>
      ) : null}
      </div>
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        pageId={manifest.id}
        onSelectBoards={selectGlobal}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {fullBoard ? (
        <PlayView
          board={fullBoard}
          reload={reloads.counters[fullBoard.name] ?? 0}
          onClose={closeFullPlay}
          page={manifest.id}
          thread={comments}
          numbers={numbers}
          start={playStart}
          canVary={!manifest.boards.find((board) => board.name === fullBoard.name)?.variantOf}
        />
      ) : null}
    </div>
  )
}
