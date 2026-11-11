export type CommentStatus = 'draft' | 'queued' | 'delivered' | 'resolved'

export type Reply = { author: 'claude' | 'user'; body: string; at: string; seen: boolean }

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
  createdAt: string
}

export type Session = { id: string; label: string; cwd: string; lastSeen: string }

/**
 * The user's one-click confirmation that a board is ready to build. `hash` is the board's closure
 * hash when it was approved, so a later edit of the board or of a board it imports shows.
 */
export type Approval = {
  id: string
  page: string
  board: string
  hash: string
  note: string
  sessionId: string
  status: 'queued' | 'delivered'
  createdAt: string
}
