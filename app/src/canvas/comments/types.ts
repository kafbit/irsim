import type { Rect } from '../geometry'

export type CommentStatus = 'draft' | 'queued' | 'delivered' | 'resolved'

export type Reply = { author: 'claude' | 'user'; body: string; at: string; seen: boolean }

export type CommentElement = { tag: string; path: string; text: string }

export type Comment = {
  id: string
  page: string
  board: string
  file: string
  line: number
  element: CommentElement
  rect: Rect
  body: string
  images: string[]
  status: CommentStatus
  sessionId: string | null
  batch: string | null
  replies: Reply[]
  createdAt: string
}

export type Session = { id: string; label: string; cwd: string; lastSeen: string }

export type PickedElement = {
  board: string
  file: string
  line: number
  element: CommentElement
  rect: Rect
}

export type NewComment = PickedElement & { page: string; body: string; images?: string[] }
