'use client'

// The label is pointer-only: Shift+S and the inspector create, rename and delete from the keyboard.
/* oxlint-disable jsx-a11y/no-static-element-interactions */

import Link from 'next/link'
import { type KeyboardEvent, memo, type PointerEvent, useCallback, useRef } from 'react'
import type { Camera } from './camera'
import { moveRect, type Move } from './frame-edit'
import type { PlacedBoard, Rect } from './geometry'
import { type PlacedSection, SECTION_LABEL } from './sections'

const DRAG_THRESHOLD = 3

/** Tokens only: the area tint, the label pill background and its text, per color name. */
const TONES = {
  gray: { area: 'var(--secondary)', pill: 'var(--muted)', text: 'var(--foreground)' },
  blue: { area: 'var(--info)', pill: 'var(--info)', text: 'var(--info-foreground)' },
  green: { area: 'var(--success)', pill: 'var(--success)', text: 'var(--success-foreground)' },
  amber: { area: 'var(--warning)', pill: 'var(--warning)', text: 'var(--warning-foreground)' },
  purple: { area: 'var(--rented)', pill: 'var(--rented)', text: 'var(--rented-foreground)' },
  red: { area: 'var(--destructive-tint)', pill: 'var(--destructive-tint)', text: 'var(--destructive)' },
} as const

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height })
const same = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

function RenameField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const finished = useRef(false)
  const attach = useCallback((element: HTMLInputElement | null) => {
    element?.focus()
    element?.select()
  }, [])
  const finish = (value: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') finish(event.currentTarget.value)
    else if (event.key === 'Escape') finish(null)
  }
  return (
    <input
      ref={attach}
      defaultValue={title}
      aria-label="Section name"
      dir="auto"
      spellCheck={false}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto h-[26px] w-48 max-w-full rounded-[6px] border border-ring bg-background px-2 text-[13px] font-semibold text-foreground outline-none"
    />
  )
}

type Props = {
  hovered: string | null
  onHover: (id: string | null) => void
  sections: PlacedSection[]
  boards: PlacedBoard[]
  pageId: string
  camera: Camera
  selected: string[]
  renaming: string | null
  /** False in the Hand tool, which pans from a label instead of moving the section. */
  movable: boolean
  onSelect: (names: string[], additive: boolean) => void
  onRenameStart: (id: string) => void
  onRename: (id: string, title: string | null) => void
  onPreview: (rects: Record<string, Rect> | null) => void
  onCommit: (moves: Move[], kind: 'move' | 'resize', label: string) => void
}

/**
 * The sections, in one layer under the frames: a tinted rectangle with a border, and a label pill
 * above its top left corner at constant screen size, so a member frame never covers the label.
 * Parents come before their sub-sections. Only the label takes the pointer. A click selects the
 * member boards, Shift adds them, a drag moves them all with one commit, and a double click renames
 * the section.
 */
export const SectionLayer = memo(function SectionLayer({
  hovered,
  onHover,
  sections,
  boards,
  pageId,
  camera,
  selected,
  renaming,
  movable,
  onSelect,
  onRenameStart,
  onRename,
  onPreview,
  onCommit,
}: Props) {
  const press = (event: PointerEvent<HTMLElement>, placed: PlacedSection) => {
    if (event.button !== 0 || !movable) return
    event.stopPropagation()
    const element = event.currentTarget
    const { pointerId, clientX, clientY } = event
    const k = camera.view.k || 1
    const items = boards
      .filter((board) => placed.members.includes(board.name))
      .map((board) => ({ name: board.name, start: rectOf(board) }))
    const additive = event.shiftKey
    let dragging = false
    let current: Move[] = items.map(({ name, start }) => ({ name, rect: start, before: start }))
    let frame = 0
    camera.focusViewport()
    element.setPointerCapture(pointerId)

    const end = (commit: boolean) => {
      cancelAnimationFrame(frame)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', cancel)
      element.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('keydown', key, true)
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
      if (!dragging) {
        if (commit) onSelect(placed.members, additive)
        return
      }
      const moved = current.filter(({ rect, before }) => !same(rect, before))
      if (commit && moved.length > 0) onCommit(moved, 'move', `move of ${placed.section.title}`)
      else onPreview(null)
    }
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const dx = next.clientX - clientX
      const dy = next.clientY - clientY
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        dragging = true
        onSelect(placed.members, false)
      }
      current = items.map(({ name, start }) => ({
        name,
        rect: moveRect(start, dx / k, dy / k),
        before: start,
      }))
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          onPreview(Object.fromEntries(current.map(({ name, rect }) => [name, rect])))
        })
      }
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const key = (next: globalThis.KeyboardEvent) => {
      if (next.key !== 'Escape') return
      next.stopPropagation()
      end(false)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', cancel)
    element.addEventListener('lostpointercapture', cancel)
    window.addEventListener('keydown', key, true)
  }

  return (
    <>
      {sections.map((placed) => {
        const { section, members, bounds, depth } = placed
        const active = hovered === section.id || members.every((name) => selected.includes(name))
        const variants = section.variantOf !== undefined
        const tone = TONES[placed.color ?? 'gray']
        // A sub-section with no color of its own reads on top of its parent's tint.
        const area = placed.color === null && depth > 0 ? 'var(--card)' : tone.area
        return (
          <div
            key={section.id}
            data-section={section.id}
            className="pointer-events-none absolute border-solid"
            style={{
              borderRadius: 'calc(var(--inv, 1) * 12px)',
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
              background: area,
              borderWidth: 'calc(var(--inv, 1) * 1px)',
              borderColor: active ? 'var(--ring)' : 'var(--border-strong)',
            }}
          >
            <div
              className="absolute flex origin-bottom-left items-center gap-2"
              style={{
                insetInlineStart: 0,
                bottom: 'calc(100% + var(--inv, 1) * 6px)',
                maxWidth: `calc(var(--k, 1) * ${bounds.width}px)`,
                height: SECTION_LABEL,
                transform: 'scale(var(--inv, 1))',
              }}
            >
              {renaming === section.id ? (
                <RenameField title={section.title} onDone={(title) => onRename(section.id, title)} />
              ) : (
                <span
                  data-section-label=""
                  className={`pointer-events-auto flex h-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 ${
                    movable ? 'cursor-move' : 'cursor-grab'
                  }`}
                  style={{ background: tone.pill, color: tone.text }}
                  onPointerDown={(event) => press(event, placed)}
                  onPointerEnter={() => onHover(section.id)}
                  onPointerLeave={() => onHover(null)}
                  onDoubleClick={() => movable && onRenameStart(section.id)}
                >
                  <span dir="auto" className="truncate text-[13px] font-semibold whitespace-nowrap">
                    {section.title}
                  </span>
                  <span className="shrink-0 text-xs whitespace-nowrap opacity-70">
                    {members.length} {members.length === 1 ? 'board' : 'boards'}
                  </span>
                </span>
              )}
              {variants ? (
                <Link
                  href={`/p/${encodeURIComponent(pageId)}/compare/${encodeURIComponent(section.variantOf ?? '')}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="pointer-events-auto inline-flex h-[26px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-border-strong bg-card px-2.5 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
                    <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
                    <path d="M12 2v20" />
                  </svg>
                  Compare
                </Link>
              ) : null}
            </div>
          </div>
        )
      })}
    </>
  )
})
