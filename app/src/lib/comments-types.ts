import type { AgentId } from './agents'

export type CommentStatus = 'draft' | 'queued' | 'delivered' | 'resolved'

export type Reply = {
  author: 'claude' | 'user'
  body: string
  at: string
  seen: boolean
  images?: string[]
  session?: string
  agent?: AgentId
}

export type CommentView = {
  width: number
  height: number
  preset: string
  scrollX: number
  scrollY: number
}

export type Comment = {
  id: string
  page: string
  board: string
  file: string
  line: number
  element: { tag: string; path: string; text: string }
  rect: { x: number; y: number; width: number; height: number }
  body: string
  images: string[]
  status: CommentStatus
  sessionId: string | null
  batch: string | null
  replies: Reply[]
  reopened?: boolean
  view?: CommentView
  createdAt: string
}

export type Session = {
  id: string
  label: string
  cwd: string
  lastSeen: string
  title?: string
  branch?: string
  agent?: AgentId
}

/**
 * The user's one-click confirmation that a board is ready to build. `hash` is the board's closure
 * hash when it was approved, so a later edit of the board or of a board it imports shows.
 */
/** The latest approval of a board: whether the board is still as approved, and whether Claude got it. */
export type BoardApproval = {
  board: string
  at: string
  current: boolean
  status: 'queued' | 'delivered'
}

/** What a page's Approve buttons need: the boards' content hashes and their latest approvals. */
export type PageApprovals = {
  hashes: Record<string, string>
  approvals: BoardApproval[]
  /** New, Changed, Approved or none, per board. Computed on every request, never stored. */
  status?: Record<string, 'new' | 'changed' | 'approved' | 'none'>
}

export type Approval = {
  id: string
  page: string
  board: string
  hash: string
  note: string
  sessionId: string
  /** Approvals made together share a batch and go out as one turn. */
  batch?: string
  status: 'queued' | 'delivered'
  createdAt: string
}

export type VariantRequestEntry = { name: string; label: string; direction: string }

export type VariantPick = { file: string; line: number; element: { tag: string; path: string; text: string } }

export type VariantRequest = {
  id: string
  page: string
  base: string
  variants: VariantRequestEntry[]
  note: string
  pick?: VariantPick
  images?: string[]
  sessionId: string
  status: 'queued' | 'delivered'
  createdAt: string
}
