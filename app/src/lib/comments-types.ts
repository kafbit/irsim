export type CommentStatus = 'draft' | 'queued' | 'delivered' | 'resolved'

export type Comment = {
  id: string
  page: string
  board: string
  file: string
  line: number
  element: { tag: string; path: string; text: string }
  rect: { x: number; y: number; width: number; height: number }
  body: string
  status: CommentStatus
  sessionId: string | null
  batch: string | null
  replies: { author: 'claude' | 'user'; body: string; at: string }[]
  createdAt: string
}

export type Session = { id: string; label: string; cwd: string; lastSeen: string }
