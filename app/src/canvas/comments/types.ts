import type { Rect } from '../geometry'
import type { AgentId } from '../../lib/agents'
import type { CommentView } from '../../lib/comments-types'

export type { CommentView }

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
  view?: CommentView
  createdAt: string
}

export type Session = {
  id: string
  label: string
  cwd: string
  lastSeen: string
  title: string
  branch?: string
  agent?: AgentId
}

export type PickedElement = {
  board: string
  file: string
  line: number
  element: CommentElement
  rect: Rect
  scroll?: { x: number; y: number }
  view?: CommentView
}

export type NewComment = PickedElement & { page: string; body: string; images?: string[] }
