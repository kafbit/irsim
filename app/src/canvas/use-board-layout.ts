'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasEdit } from '../lib/canvas-layout'
import { editsOf, type Move, moveRect } from './frame-edit'
import type { PlacedBoard, Rect } from './geometry'
import { type ApplyResult, createHistory, type Outcome } from './history'
import { dropServed, sectionsKey } from './layout-sync'
import {
  applySectionEdit,
  assignEdits,
  initialSectionState,
  type SectionState,
  withMembership,
} from './sections'
import { clearLayoutEdits } from './tidy-section'
import type { CanvasSection } from './types'
import { useMountEffect } from './use-mount-effect'

const NUDGE_QUIET_MS = 400
const ERROR_MS = 6000
const GEOMETRY = ['x', 'y', 'width', 'height'] as const

type Pending = { key: string; items: Map<string, { rect: Rect; before: Rect }> }

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height })

async function send(page: string, edit: CanvasEdit): Promise<ApplyResult> {
  try {
    const response = await fetch('/api/canvas', {
      method: 'PATCH',
      cache: 'no-store',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page, ...edit }),
    })
    if (response.ok) return { ok: true }
    const detail = (await response.json().catch(() => null)) as { error?: unknown } | null
    return {
      ok: false,
      status: response.status,
      error: typeof detail?.error === 'string' ? detail.error : `HTTP ${response.status}`,
    }
  } catch (failure) {
    return { ok: false, status: 0, error: String((failure as Error)?.message ?? failure) }
  }
}

/**
 * The page's boards with the user's moves and resizes applied: committed overrides, the rects being
 * dragged (`preview`) and the ones nudged by key. A board nobody touched keeps its object, so its
 * memoized frame does not render. `commit` is optimistic: the PATCH follows, and a failure restores
 * the previous rects and sets `error`. Nudges are saved after 400 ms without another one. Every
 * saved edit is recorded in the page's history, which `undo` and `redo` walk. When `base` changes
 * (the server's manifest was fetched again), the committed rects the server now reports are
 * dropped, and the sections are rebuilt from the server when its sections or memberships differ.
 */
export function useBoardLayout(
  pageId: string,
  base: PlacedBoard[],
  baseSections: CanvasSection[] = [],
) {
  const [placed, setPlaced] = useState<Record<string, Rect>>({})
  const [live, setLive] = useState<Record<string, Rect> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sectionState, setSectionState] = useState<SectionState>(() =>
    initialSectionState(baseSections, base),
  )
  const [servedBase, setServedBase] = useState(base)
  const [servedKey, setServedKey] = useState(() => sectionsKey(baseSections, base))
  if (servedBase !== base) {
    setServedBase(base)
    setPlaced((current) => dropServed(current, base))
    const key = sectionsKey(baseSections, base)
    if (key !== servedKey) {
      setServedKey(key)
      setSectionState(initialSectionState(baseSections, base))
    }
  }
  const pending = useRef<Pending | null>(null)
  const saves = useRef<Promise<unknown>>(Promise.resolve())
  const nudgeTimer = useRef(0)
  const errorTimer = useRef(0)
  const baseRef = useRef(base)
  const stateRef = useRef(sectionState)
  useEffect(() => {
    baseRef.current = base
    stateRef.current = sectionState
  })

  /** Sections with a stored layout that these moves break: a frame moved or resized by hand, not the whole section. */
  const layoutClears = useCallback((moves: Move[]) => {
    const { sections, sectionOf } = stateRef.current
    const moved = new Set(moves.map((move) => move.name))
    const translated = moves.every(
      ({ rect, before }) => rect.width === before.width && rect.height === before.height,
    )
    const hit = sections.filter((section) => {
      if (!section.layout) return false
      const direct = Object.entries(sectionOf).filter(([, id]) => id === section.id)
      if (!direct.some(([name]) => moved.has(name))) return false
      return !(translated && direct.every(([name]) => moved.has(name)))
    })
    return clearLayoutEdits(hit)
  }, [])

  const boards = useMemo(
    () =>
      withMembership(
        base.map((board) => {
          const rect = live?.[board.name] ?? placed[board.name]
          return rect ? { ...board, ...rect } : board
        }),
        sectionState.sectionOf,
      ),
    [base, placed, live, sectionState.sectionOf],
  )

  const applyLocal = useCallback((edit: CanvasEdit) => {
    setPlaced((current) => {
      const next = { ...current }
      for (const item of edit.boards ?? []) {
        const geometry: Partial<Rect> = {}
        for (const key of GEOMETRY) if (item[key] !== undefined) geometry[key] = item[key]
        if (Object.keys(geometry).length === 0) continue
        const from = current[item.name] ?? baseRef.current.find((board) => board.name === item.name)
        if (from) next[item.name] = { ...rectOf(from), ...geometry }
      }
      return next
    })
    setSectionState((current) => applySectionEdit(current, edit))
  }, [])

  const history = useMemo(
    () =>
      createHistory(async (edit) => {
        const result = await send(pageId, edit)
        if (result.ok) applyLocal(edit)
        return result
      }),
    [pageId, applyLocal],
  )

  const describe = useCallback((verb: string, names: string[]) => {
    const [only] = names
    if (names.length === 1 && only !== undefined) {
      const title = baseRef.current.find((board) => board.name === only)?.title
      return `${verb} of ${title || only}`
    }
    return `${verb} of ${names.length} boards`
  }, [])

  const fail = useCallback((message: string) => {
    setError(message)
    window.clearTimeout(errorTimer.current)
    errorTimer.current = window.setTimeout(() => setError(null), ERROR_MS)
  }, [])

  const persist = useCallback(
    (moves: Move[], label: string, merge?: string) => {
      const geometry = editsOf(moves)
      const cleared = layoutClears(moves)
      const before: CanvasEdit = { ...geometry.before, ...cleared?.before }
      const after: CanvasEdit = { ...geometry.after, ...cleared?.after }
      if (cleared) applyLocal(cleared.after)
      const saved = send(pageId, after).then((result) => {
        if (result.ok) return history.record(label, before, after, merge)
        if (cleared) applyLocal(cleared.before)
        setPlaced((current) => ({
          ...current,
          ...Object.fromEntries(moves.map(({ name, before: rect }) => [name, rect])),
        }))
        const names = moves.map((move) => move.name).join(', ')
        fail(`Could not save ${names}: ${result.error}`)
      })
      saves.current = saves.current.then(() => saved)
    },
    [applyLocal, fail, history, layoutClears, pageId],
  )

  const flush = useCallback(() => {
    window.clearTimeout(nudgeTimer.current)
    const waiting = pending.current
    pending.current = null
    if (!waiting) return
    const moves = [...waiting.items].map(([name, { rect, before }]) => ({ name, rect, before }))
    persist(moves, describe('nudge', [...waiting.items.keys()]), `nudge:${waiting.key}`)
  }, [describe, persist])

  /**
   * A section edit (create, rename, delete, membership) shows at once, then is saved. A failure
   * applies `before` again and sets `error`. A saved edit is recorded as one history entry.
   */
  const editSections = useCallback(
    (label: string, before: CanvasEdit, after: CanvasEdit) => {
      flush()
      applyLocal(after)
      const saved = send(pageId, after).then((result) => {
        if (result.ok) return history.record(label, before, after)
        applyLocal(before)
        fail(`Could not save ${label}: ${result.error}`)
      })
      saves.current = saves.current.then(() => saved)
    },
    [applyLocal, fail, flush, history, pageId],
  )

  const preview = useCallback((rects: Record<string, Rect> | null) => setLive(rects), [])

  const commit = useCallback(
    (
      moves: Move[],
      kind: 'move' | 'resize',
      label?: string | { section: string | null },
      drop?: { section: string | null },
    ) => {
      const target = typeof label === 'object' ? label : drop
      const name = typeof label === 'string' ? label : undefined
      const names = moves.map((move) => move.name)
      const text = name ?? describe(kind, names)
      // A frame dropped into or out of a section: the move and the new section are one edit, so
      // one undo puts both back.
      if (
        target &&
        names.some((item) => (sectionState.sectionOf[item] ?? null) !== target.section)
      ) {
        const { before, after } = editsOf(moves)
        const cleared = layoutClears(moves)
        const assigned = assignEdits(names, boards, target.section)
        const join = (geometry: CanvasEdit, section: CanvasEdit): CanvasEdit => ({
          boards: (geometry.boards ?? []).map((item) => ({
            ...item,
            ...(section.boards ?? []).find((entry) => entry.name === item.name),
          })),
        })
        setLive(null)
        editSections(
          text,
          { ...join(before, assigned.before), ...cleared?.before },
          { ...join(after, assigned.after), ...cleared?.after },
        )
        return
      }
      flush()
      setPlaced((current) => ({
        ...current,
        ...Object.fromEntries(moves.map(({ name, rect }) => [name, rect])),
      }))
      setLive(null)
      persist(moves, text)
    },
    [boards, describe, editSections, flush, layoutClears, persist, sectionState.sectionOf],
  )

  const nudge = useCallback(
    (targets: PlacedBoard[], dx: number, dy: number) => {
      const key = targets
        .map((target) => target.name)
        .sort()
        .join('\0')
      if (pending.current && pending.current.key !== key) flush()
      const waiting = pending.current
      const items = new Map<string, { rect: Rect; before: Rect }>()
      for (const target of targets) {
        const earlier = waiting?.items.get(target.name)
        items.set(target.name, {
          rect: moveRect(earlier?.rect ?? target, dx, dy),
          before: earlier?.before ?? rectOf(target),
        })
      }
      pending.current = { key, items }
      setPlaced((current) => ({
        ...current,
        ...Object.fromEntries([...items].map(([name, { rect }]) => [name, rect])),
      }))
      window.clearTimeout(nudgeTimer.current)
      nudgeTimer.current = window.setTimeout(flush, NUDGE_QUIET_MS)
    },
    [flush],
  )

  const walk = useCallback(
    async (direction: 'undo' | 'redo'): Promise<Outcome> => {
      flush()
      await saves.current
      return direction === 'undo' ? history.undo() : history.redo()
    },
    [flush, history],
  )
  const undo = useCallback(() => walk('undo'), [walk])
  const redo = useCallback(() => walk('redo'), [walk])

  useMountEffect(() => flush)

  return {
    boards,
    sections: sectionState.sections,
    sectionOf: sectionState.sectionOf,
    error,
    preview,
    commit,
    nudge,
    editSections,
    undo,
    redo,
    record: history.record,
    history,
  }
}
