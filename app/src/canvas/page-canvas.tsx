'use client'

// The viewport is a custom pan/zoom widget: it needs focus and pointer handlers for its shortcuts.
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ApproveBox } from './approvals/approve-box'
import { useApprovals } from './approvals/use-approvals'
import { CommentLayer } from './comments/comment-layer'
import { Composer } from './comments/composer'
import { ContextMenu } from './context-menu'
import { canvasMenuGroups, menuGroups, type MenuItemId, pendingNames } from './context-menu-model'
import { boardPick, buildNote, numberComments, placedRect } from './comments/model'
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
import { patchPage } from './page-menu'
import { PagePopovers, type PagePopover } from './page-popover'
import { sendPageRequest } from './page-requests'
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
  SECTION_PAD,
  withMembership,
} from './sections'
import { SectionLayer } from './section-layer'
import { LiveSections, SectionPaint } from './section-paint'
import { DEFAULT_GAP, directMembers, sectionTidyEdits, type TidyRequest, wrapWidth } from './tidy-section'
import { SettingsDialog } from './settings-dialog'
import { Sidebar } from './sidebar'
import { pendingOf } from './approvals/pending'
import { TopBar } from './top-bar'
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
import { useCulling } from './use-culling'
import { useViewport } from './use-viewport'
import { ViewControls } from './view-controls'
import { readMinimap, writeMinimap, readSidebar, writeSidebar} from './view-storage'

const VIEWPORT_STYLE = { backgroundColor: 'var(--surface)' } as const

const GRID_LAYER_STYLE = {
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
  /** Runs when `canvas.json` or a board file changed on the server; the parent fetches the manifest again. Must be stable. */
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
  const [liveSections] = useState(() => new LiveSections())
  const [menu, setMenu] = useState<{
    x: number
    y: number
    names: string[]
    wholeSection: string | null
    sidebar: boolean
    canvas: boolean
  } | null>(null)
  const [pagePopover, setPagePopover] = useState<PagePopover | null>(null)
  const [gridFor, setGridFor] = useState<string | null>(null)
  const [variantsFocus, setVariantsFocus] = useState<{ name: string; count: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const mounts = useMounts(boards)
  const marqueeRef = useRef<HTMLDivElement>(null)
  const marqueeBase = useRef<string[]>([])
  const marqueeNames = useRef<string[] | null>(null)
  const latest = useRef({ selection, boards })
  useEffect(() => {
    latest.current = { selection, boards }
  })
  const onMarquee = useCallback((world: Rect | null, additive: boolean, start: boolean) => {
    if (!world) {
      marqueeNames.current = null
      return
    }
    if (start) marqueeBase.current = additive ? latest.current.selection.names : []
    const names = [...marqueeBase.current, ...boardsInRect(world, latest.current.boards)]
    const last = marqueeNames.current
    if (last && last.length === names.length && last.every((name, i) => name === names[i])) return
    marqueeNames.current = names
    dispatch({ type: 'set', names })
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
    marqueeRef,
    onCommit: mounts.update,
    onTap,
    onMarquee,
  })
  useCulling(camera, boards)
  const comments = useComments(manifest.id)
  const reloads = useBoardReloads()
  const numbers = useMemo(() => numberComments(comments.comments), [comments.comments])
  const commenting = tool === 'comment'
  const playFlags = usePlayFlags(manifest.id)
  const approvals = useApprovals(manifest.id)
  const { reload: reloadBoard, reloadAll: reloadAllBoards } = reloads
  const { refresh: refreshFlags } = playFlags
  const { refetch: refetchApprovals } = approvals
  // A changed board may gain or lose its handlers and links, so its Play chip is read again, and
  // an approval of it may no longer hold. The manifest carries the render hash of each board and of
  // every board that imports it, and the thumbnail URL is keyed on that hash.
  const onBoardChange = useCallback(
    (name: string) => {
      reloadBoard(name)
      refreshFlags()
      void refetchApprovals()
      onCanvasChange?.()
    },
    [reloadBoard, refreshFlags, refetchApprovals, onCanvasChange],
  )
  const onSharedChange = useCallback(() => {
    reloadAllBoards()
    refreshFlags()
    void refetchApprovals()
    onCanvasChange?.()
  }, [reloadAllBoards, refreshFlags, refetchApprovals, onCanvasChange])
  const [thumbs, setThumbs] = useState<Record<string, { rev: number; ok: boolean }>>({})
  const onThumb = useCallback((name: string, ok: boolean) => {
    setThumbs((prev) => ({ ...prev, [name]: { rev: (prev[name]?.rev ?? 0) + 1, ok } }))
  }, [])
  useEvents({
    onBoard: onBoardChange,
    onShared: onSharedChange,
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
  const placedRef = useRef(placedSectionList)
  useEffect(() => {
    placedRef.current = placedSectionList
  })
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
      if (section.layout) {
        const members = directMembers(id, latestEdit.current.boards)
        const widest = Math.max(0, ...members.map((member) => member.width))
        const width = Math.max(rect.width, widest + SECTION_PAD * 2)
        const edits = sectionTidyEdits(section, latestEdit.current.boards, {
          mode: 'wrap',
          gap: section.layout.gap,
          width: width - SECTION_PAD * 2,
          area: { ...rect, width },
        })
        if (edits) editSections(`resize of ${section.title}`, edits.before, edits.after)
        return
      }
      const { before, after } = resizeSectionEdits(section, rect)
      editSections(`resize of ${section.title}`, before, after)
    },
    [editSections],
  )
  const tidySection = useCallback(
    (id: string, request: TidyRequest) => {
      const current = latestEdit.current
      const section = current.sections.find((candidate) => candidate.id === id)
      if (!section) return
      const placed = placedRef.current.find((item) => item.section.id === id)
      const width =
        request.mode === 'wrap' && request.width === undefined && placed
          ? wrapWidth(placed.bounds, directMembers(id, current.boards))
          : request.width
      const edits = sectionTidyEdits(section, current.boards, {
        ...request,
        ...(width === undefined ? {} : { width }),
        ...(width !== undefined && request.width === undefined && placed
          ? { originX: placed.bounds.x + SECTION_PAD }
          : {}),
      })
      if (edits) editSections(`tidy of ${section.title}`, edits.before, edits.after)
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
  const [playParam, setPlayParam] = useState(play)
  if (play !== playParam) {
    setPlayParam(play)
    if (play && focus) playBoard(focus, play)
  }
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
  const selectedSet = useMemo(() => new Set(selection.names), [selection.names])
  const only = selection.names.length === 1 ? (selection.names[0] ?? null) : null
  const playing = fullPlay ?? (selection.interacting ? only : null)
  useEffect(() => {
    playRun.current += 1
    if (playing) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('play')) return
    url.searchParams.delete('play')
    window.history.replaceState(null, '', url)
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
  /** Approve and build on a comment: one approval with a note, then the comment is resolved. */
  const approveAndBuild = useCallback(
    async (comment: Comment) => {
      if (!comment.sessionId) return
      try {
        await approvals.approve({
          board: comment.board,
          sessionId: comment.sessionId,
          note: buildNote(comment),
        })
      } catch (failure) {
        setNotice(String((failure as Error)?.message ?? failure), 'error')
        throw failure
      }
      await comments.resolve(comment.id)
      setNotice(`Sent ${comment.board} to the agent to build`, 'info')
    },
    [approvals, comments, setNotice],
  )

  const openSectionMenu = (id: string, point: { x: number; y: number }, sidebar: boolean) => {
    const placed = placedSectionList.find((item) => item.section.id === id)
    if (!placed) return
    selectBoards(placed.members)
    setSelectedSection(placed.section.id)
    setMenu({ ...point, names: placed.members, wholeSection: placed.section.id, sidebar, canvas: false })
  }
  const openFrameMenu = (name: string, point: { x: number; y: number }, sidebar: boolean) => {
    const kept = selection.names.includes(name)
    if (!kept) dispatch({ type: 'select', name })
    setMenu({
      ...point,
      names: kept ? selection.names : [name],
      wholeSection: kept ? sectionSelected : null,
      sidebar,
      canvas: false,
    })
  }
  const onContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const point = { x: event.clientX, y: event.clientY }
    const label = target.closest<HTMLElement>('[data-section-label]')
    const sectionId = label?.getAttribute('data-section-id') ?? null
    if (sectionId && placedSectionList.some((item) => item.section.id === sectionId)) {
      event.preventDefault()
      openSectionMenu(sectionId, point, false)
      return
    }
    const name = boardOf(target)
    if (name) {
      event.preventDefault()
      openFrameMenu(name, point, false)
      return
    }
    const onWorld = target === event.currentTarget || target.closest('[data-world]') !== null
    if (!onWorld || target.closest('button, a, input, textarea, select')) return
    event.preventDefault()
    setMenu({ ...point, names: [], wholeSection: null, sidebar: false, canvas: true })
  }
  const variantOf = useMemo(
    () => new Map(manifest.boards.map((board) => [board.name, board.variantOf])),
    [manifest.boards],
  )
  const menuItems = useCallback(
    (connected: boolean) =>
      menu?.canvas
        ? canvasMenuGroups({ connected, sidebarShown })
        : menu
        ? menuGroups({
            names: menu.names,
            boards: boards.map((board) => ({
              name: board.name,
              section: board.section,
              interactive: board.interactive,
              variantOf: variantOf.get(board.name),
            })),
            sections,
            stateOf: approvals.stateOf,
            connected,
            wholeSection: menu.wholeSection,
            sidebar: menu.sidebar,
          })
        : [],
    [menu, boards, variantOf, sections, approvals.stateOf, sidebarShown],
  )
  const runMenuItem = (id: MenuItemId, sessionId: string | null) => {
    if (!menu) return
    const { names, wholeSection, x, y } = menu
    const [first] = names
    const direct = wholeSection
      ? names.filter((name) => boards.find((board) => board.name === name)?.section === wholeSection)
      : names
    setMenu(null)
    const fail = (failure: unknown) => setNotice(String((failure as Error)?.message ?? failure), 'error')
    const copyText = (text: string, done: string) =>
      navigator.clipboard
        .writeText(text)
        .then(() => setNotice(done, 'info'))
        .catch(fail)
    const placedSection = wholeSection
      ? placedSectionList.find((item) => item.section.id === wholeSection)
      : undefined
    const tidyWith = (mode: 'row' | 'column' | 'wrap') => {
      if (!placedSection) return
      const members = directMembers(placedSection.section.id, boards)
      const widest = Math.max(0, ...members.map((member) => member.width))
      tidySection(placedSection.section.id, {
        mode,
        gap: placedSection.section.layout?.gap ?? DEFAULT_GAP,
        ...(mode === 'wrap'
          ? { width: Math.max(placedSection.bounds.width - SECTION_PAD * 2, widest) }
          : {}),
      })
    }
    if (id === 'copy-page-name') copyText(manifest.title, 'Copied the page name')
    else if (id === 'copy-page-link') {
      copyText(`${window.location.origin}/p/${encodeURIComponent(manifest.id)}`, 'Copied the page link')
    } else if (id === 'select-all') dispatch({ type: 'selectAll', names: boards.map((board) => board.name) })
    else if (id === 'zoom-fit') actions.fit()
    else if (id === 'zoom-100') actions.actualSize()
    else if (id === 'toggle-sidebar') toggleSidebar()
    else if (id === 'rename-page') setPagePopover({ kind: 'rename', x, y })
    else if (id === 'change-icon') setPagePopover({ kind: 'icon', x, y })
    else if ((id === 'reorganize' || id === 'choose-icon') && sessionId) {
      sendPageRequest({ page: manifest.id, kind: id === 'reorganize' ? 'reorganize' : 'icon', sessionId })
        .then(() =>
          setNotice(
            id === 'reorganize' ? 'Asked the agent to reorganize the frames' : 'Asked the agent to choose an icon',
            'info',
          ),
        )
        .catch(fail)
    } else if (id === 'show-on-canvas') {
      if (wholeSection) {
        selectBoards(names)
        setSelectedSection(wholeSection)
        actions.focusBoards(names)
      } else if (first) focusBoard(first)
    } else if (id === 'tidy-row') tidyWith('row')
    else if (id === 'tidy-column') tidyWith('column')
    else if (id === 'tidy-wrap') tidyWith('wrap')
    else if (id === 'tidy-grid' && wholeSection) {
      setPanelOpen(false)
      setGridFor(wholeSection)
    } else if (id === 'copy') {
      navigator.clipboard
        .writeText(names.join('\n'))
        .then(() =>
          setNotice(names.length === 1 ? `Copied ${first}` : `Copied ${names.length} frame names`, 'info'),
        )
        .catch(fail)
    } else if (id === 'play' && first) playBoard(first, 'canvas')
    else if (id === 'comment' && first) {
      changeTool('comment')
      commentOnBoard(first)
    } else if (id === 'variants' && first) {
      dispatch({ type: 'select', name: first })
      setPanelOpen(false)
      setVariantsFocus((current) => ({ name: first, count: (current?.count ?? 0) + 1 }))
    } else if (id === 'approve' && sessionId) {
      approveBoards({ boards: pendingNames(names, approvals.stateOf), sessionId }).catch(fail)
    } else if (id === 'create-section') createSection(names, false)
    else if (id === 'create-sub-section') createSection(direct, true)
    else if (id === 'rename-section' && wholeSection) setRenaming(wholeSection)
    else if (id === 'remove-from-section') assignSection(direct, null)
    else if (id === 'delete-section' && wholeSection) deleteSection(wholeSection)
  }
  useEffect(() => {
    if (menu && !menu.canvas && selection.names.length === 0) setMenu(null)
  }, [menu, selection.names.length])
  useEffect(() => {
    if (gridFor && sectionSelected !== gridFor) setGridFor(null)
  }, [gridFor, sectionSelected])
  const savePageTitle = useCallback(
    (title: string) => {
      setPagePopover(null)
      if (title === manifest.title) return
      patchPage({ page: manifest.id, title })
        .then(() => onCanvasChange?.())
        .catch((failure: unknown) => setNotice(String((failure as Error)?.message ?? failure), 'error'))
    },
    [manifest.id, manifest.title, onCanvasChange, setNotice],
  )
  const savePageIcon = useCallback(
    (icon: string | null) => {
      setPagePopover(null)
      patchPage({ page: manifest.id, icon })
        .then(() => onCanvasChange?.())
        .catch((failure: unknown) => setNotice(String((failure as Error)?.message ?? failure), 'error'))
    },
    [manifest.id, onCanvasChange, setNotice],
  )
  const clearVariantsFocus = useCallback(() => setVariantsFocus(null), [])
  useEffect(() => {
    if (variantsFocus && only !== variantsFocus.name) setVariantsFocus(null)
  }, [only, variantsFocus])

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
          onFrameMenu={(name, point) => openFrameMenu(name, point, true)}
          onSectionMenu={(id, point) => openSectionMenu(id, point, true)}
        />
      ) : null}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Design canvas"
        {...handlers}
        onContextMenu={onContextMenu}
        className={`relative min-w-0 flex-1 touch-none overflow-clip outline-none select-none ${
          tool === 'hand' ? 'cursor-grab' : ''
        }`}
        style={VIEWPORT_STYLE}
      >
        <div
          data-canvas-grid=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={GRID_LAYER_STYLE}
        />
        <SectionPaint
          camera={camera}
          sections={placedSectionList}
          live={liveSections}
          hovered={hoveredSection}
          selected={sectionSelected}
          dropTarget={dropTarget ?? null}
        />
        <div
          ref={worldRef}
          data-world=""
          data-hand={tool === 'hand' ? '' : undefined}
          className="absolute start-0 top-0 origin-top-left"
          onPointerDown={frameEdit.onTitleDown}
          onPointerOver={(event) => event.buttons === 0 && setHovered(boardOf(event.target))}
          onPointerLeave={() => setHovered(null)}
        >
          <SectionLayer
            hovered={hoveredSection}
            live={liveSections}
            onHover={setHoveredSection}
            sections={placedSectionList}
            boards={boards}
            pageId={manifest.id}
            camera={camera}
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
                selected={selectedSet.has(board.name)}
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
        <Marquee ref={marqueeRef} />
        {commenting && pick ? (
          <Composer
            key={`${pick.board}:${pick.file}:${pick.line}:${pick.rect.x}:${pick.rect.y}`}
            camera={camera}
            boards={boards}
            pick={pick}
            page={manifest.id}
            canVary={!manifest.boards.find((board) => board.name === pick.board)?.variantOf}
            onSave={async (body, images, sendTo) => {
              const problem = await comments.create({ ...pick, page: manifest.id, body, images }, sendTo)
              setPick(null)
              if (problem) setNotice(`Saved as a draft. Sending failed: ${problem}`, 'error')
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
          onSendOne={comments.sendOne}
          onRetarget={comments.retarget}
          onApproveAndBuild={approveAndBuild}
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
            onTidy: tidySection,
            gridFor,
          }}
          onFocusBoard={focusBoard}
          variantsFocus={variantsFocus?.count ?? 0}
          onVariantsFocused={clearVariantsFocus}
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
      <ContextMenu
        menu={menu}
        groups={menuItems}
        onSelect={runMenuItem}
        onClose={() => setMenu(null)}
      />
      <PagePopovers
        popover={pagePopover}
        title={manifest.title}
        icon={manifest.icon}
        onRename={savePageTitle}
        onPick={savePageIcon}
        onClose={() => setPagePopover(null)}
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
          onApproveAndBuild={approveAndBuild}
          onNotice={setNotice}
        />
      ) : null}
    </div>
  )
}
