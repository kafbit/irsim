import { formatNumber } from '../../lib/format-number'
import { isWholeBoard } from '../../lib/place-text'
import type { Rect, Size, View } from '../geometry'
import { CHROME_FORMAT } from '../chrome-format'
import type { Comment, PickedElement, Session } from './types'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isLine = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0

const isRect = (value: unknown): value is Rect => {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, width, height } = value as Record<string, unknown>
  return [x, y, width, height].every(isNumber)
}

const isScroll = (value: unknown): value is { x: number; y: number } => {
  if (typeof value !== 'object' || value === null) return false
  const { x, y } = value as Record<string, unknown>
  return isNumber(x) && isNumber(y)
}

/** Reads a frame's `pick` message. Returns null for anything that lacks a board, a file, a line, an element or a rect. */
export function parsePick(data: unknown): PickedElement | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, board, details } = data as Record<string, unknown>
  if (type !== 'pick' || typeof board !== 'string' || typeof details !== 'object' || !details) {
    return null
  }
  const { file, line, element, rect, scroll } = details as Record<string, unknown>
  if (typeof file !== 'string' || !isLine(line) || !isRect(rect)) return null
  if (typeof element !== 'object' || element === null) return null
  const { tag, path, text } = element as Record<string, unknown>
  if (typeof tag !== 'string' || typeof path !== 'string') return null
  return {
    board,
    file,
    line,
    rect,
    element: { tag, path, text: typeof text === 'string' ? text : '' },
    ...(isScroll(scroll) ? { scroll: { x: scroll.x, y: scroll.y } } : {}),
  }
}

/** The pick for a comment on a whole board: line 0, the board title as text and the whole frame as rect. */
export function boardPick(board: {
  name: string
  file?: string | undefined
  title: string
  width: number
  height: number
}): PickedElement {
  return {
    board: board.name,
    file: `design/${board.file ?? `${board.name}.html`}`,
    line: 0,
    element: { tag: 'board', path: '', text: board.title || board.name },
    rect: { x: 0, y: 0, width: board.width, height: board.height },
  }
}

/** The rect a comment is placed by: a whole-board comment follows the board's current size, an element comment keeps its stored rect. */
export function placedRect(frame: Size, comment: { line: number; rect: Rect }): Rect {
  return isWholeBoard(comment) ? { x: 0, y: 0, width: frame.width, height: frame.height } : comment.rect
}

/** The screen rectangle (relative to the viewport) of `rect`, which is in the coordinates of the board placed at `frame`. */
export function toScreen(frame: Rect, rect: Rect, view: View): Rect {
  return {
    x: (frame.x + rect.x) * view.k + view.x,
    y: (frame.y + rect.y) * view.k + view.y,
    width: rect.width * view.k,
    height: rect.height * view.k,
  }
}

const GAP = 8
const EDGE = 8

/** Puts a panel below `anchor`, flipped above when it does not fit, then clamped inside the viewport. */
export function placePanel(anchor: Rect, viewport: Size, panel: Size): { x: number; y: number } {
  const below = anchor.y + anchor.height + GAP
  const above = anchor.y - GAP - panel.height
  const y = below + panel.height <= viewport.height - EDGE || above < EDGE ? below : above
  const clamp = (value: number, size: number, space: number) =>
    Math.max(EDGE, Math.min(value, space - size - EDGE))
  return {
    x: clamp(anchor.x, panel.width, viewport.width),
    y: clamp(y, panel.height, viewport.height),
  }
}

type Choice = {
  sessions: readonly Session[]
  fromUrl: string | null
  stored: string | null
  picked: string | null
}

/**
 * The session a send goes to. A pick made in this tab wins while its session is live (or came from
 * the URL), then the `?session=` id, then the remembered one if live, then the only live session.
 */
export function chooseSession({ sessions, fromUrl, stored, picked }: Choice): string | null {
  const live = (id: string | null) => id !== null && sessions.some((session) => session.id === id)
  if (picked && (picked === fromUrl || live(picked))) return picked
  if (fromUrl) return fromUrl
  if (live(stored)) return stored
  return sessions.length === 1 ? (sessions[0]?.id ?? null) : null
}

/** Numbers every comment of a page by creation time, oldest first, so a pin keeps its number when others resolve. */
export function numberComments(comments: readonly Comment[]): Map<string, number> {
  const ordered = [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  return new Map(ordered.map((comment, index) => [comment.id, index + 1]))
}

export type Groups = { draft: Comment[]; sent: Comment[]; resolved: Comment[] }

/** Draft, Sent (queued and delivered) and Resolved, each keeping the order it came in. */
export function groupComments(comments: readonly Comment[]): Groups {
  const groups: Groups = { draft: [], sent: [], resolved: [] }
  for (const comment of comments) {
    if (comment.status === 'draft') groups.draft.push(comment)
    else if (comment.status === 'resolved') groups.resolved.push(comment)
    else groups.sent.push(comment)
  }
  return groups
}

/** The collapsed header of the resolved comments, or null when there are none to show. */
export const resolvedHeading = (count: number): string | null =>
  count > 0 ? `Resolved (${formatNumber(count, CHROME_FORMAT)})` : null

/** True when clamped text is taller than the box that shows it, so a "Show more" button is needed. */
export const isClamped = (scrollHeight: number, clientHeight: number): boolean =>
  scrollHeight - clientHeight > 1

export const sendLabel = (count: number) => `Send ${count} ${count === 1 ? 'comment' : 'comments'}`

/** Boards whose frame must reload when `changed` is edited: those whose reported import closure contains it. */
export function boardsToReload(
  closures: ReadonlyMap<string, readonly string[]>,
  changed: string,
): string[] {
  const names: string[] = []
  for (const [board, closure] of closures) {
    if (board === changed || closure.includes(changed)) names.push(board)
  }
  return names
}

/** The approval note for Approve and build on a comment: the agent builds the change it asked for. */
export const buildNote = (comment: Pick<Comment, 'id' | 'body'>): string =>
  `The user accepted the board change for comment ${comment.id}: "${comment.body}". Implement it in the app.`
