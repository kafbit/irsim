import { CanvasError, api, doctorLines, oneLine, runDoctor } from './api'
import type { CheckResult, Comment, Engine, Page } from './api'
import { openCanvas } from './canvas'

export const TOOL_NAME = 'design_canvas'
export const TOOL_DESCRIPTION =
  'Reads and answers design canvas comments, checks boards, and checks the project. Actions: open, page, comments, reply, resolve, check, doctor. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.'

export const TOOL_MATCH = /^mcp__.*__design_canvas$/

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['open', 'page', 'comments', 'reply', 'resolve', 'check', 'doctor'],
    },
    page: { type: 'string', description: 'Page id, for open, page, comments and check.' },
    board: { type: 'string', description: 'Board name, for open and check.' },
    status: {
      type: 'string',
      enum: ['draft', 'queued', 'delivered', 'resolved'],
      description: 'Filter for comments.',
    },
    id: { type: 'string', description: 'Comment id, for reply and resolve.' },
    body: { type: 'string', description:
        'Reply text, for reply and resolve. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.' },
  },
  required: ['action'],
}

const isWholeBoard = (comment: Comment): boolean => comment.line === 0

export function commentLine(comment: Comment): string {
  const replies = comment.replies.length
  const place = isWholeBoard(comment) ? comment.file : `${comment.file}:${comment.line}`
  const viewport = comment.view ? ` viewport ${comment.view.width}x${comment.view.height}` : ''
  const target = `${isWholeBoard(comment) ? 'board' : comment.element.path} "${comment.element.text}"`
  const tail = replies > 0 ? ` (${replies} ${replies === 1 ? 'reply' : 'replies'})` : ''
  return oneLine(
    `${comment.id} ${comment.status} ${place}${viewport} ${target} ${comment.body}${tail}`,
  )
}

async function listComments($: Engine, status?: string, page?: string): Promise<string> {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (page) query.set('page', page)
  const suffix = query.toString() ? `?${query}` : ''
  const comments = await api<Comment[]>($, `/api/comments${suffix}`)
  const shown = status ? comments : comments.filter((comment) => comment.status !== 'resolved')
  return shown.length > 0 ? shown.map(commentLine).join('\n') : 'No comments.'
}

async function pageManifest($: Engine, pageId: string): Promise<string> {
  const page = await api<Page>($, `/api/pages/${encodeURIComponent(pageId)}`)
  const lines = page.boards.map((board) => {
    const closure =
      board.closure && board.closure.length > 0 ? `  closure: ${board.closure.join(', ')}` : ''
    const variant = board.variantOf ? `  variant of ${board.variantOf}: ${board.variantLabel ?? ''}` : ''
    const section = board.section ? `  section: ${board.section}` : ''
    return `${board.name}  ${board.width}x${board.height}${closure}${variant}${section}`
  })
  const sections = (page.sections ?? []).map((entry) => {
    const count = page.boards.filter((board) => board.section === entry.id).length
    return `section ${entry.id}: ${entry.title} (${count} ${count === 1 ? 'board' : 'boards'})`
  })
  return [`${page.id}: ${page.title}`, ...sections, ...lines].join('\n')
}

export function checkLines(results: CheckResult[]): string {
  if (results.length === 0) return 'No boards to check.'
  const lines = results.flatMap((result) => {
    const head = `${result.board} ${result.ok ? 'ok' : 'FAIL'} ${result.ms} ms`
    const shot = result.screenshot ? `screenshot: ${result.screenshot}` : 'no screenshot'
    if (result.ok) return [`${head} · ${shot}`]
    return [
      head,
      ...result.errors.map((error) => `  error: ${oneLine(error)}`),
      ...result.warnings.map((warning) => `  warning: ${oneLine(warning)}`),
      `  ${shot}`,
    ]
  })
  const failed = results.filter((result) => !result.ok).length
  if (results.length > 1) lines.push(`${results.length - failed} ok, ${failed} failed`)
  return lines.join('\n')
}

async function check($: Engine, board?: string, page?: string): Promise<string> {
  if (!board && !page) throw new CanvasError('check needs board or page')
  if (board && page) throw new CanvasError('check takes board or page, not both')
  const path = board
    ? `/api/boards/${encodeURIComponent(board)}/check`
    : `/api/pages/${encodeURIComponent(page ?? '')}/check`
  return checkLines(await api<CheckResult[]>($, path, { method: 'POST' }))
}

function need(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value)
    throw new CanvasError(`${String(args.action)} needs ${key}`)
  return value
}

function optional(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value ? value : undefined
}

export async function runTool($: Engine, args: Record<string, unknown>): Promise<string> {
  const id = args.action === 'reply' || args.action === 'resolve' ? need(args, 'id') : ''
  switch (args.action) {
    case 'open': {
      const page = optional(args, 'page')
      const board = optional(args, 'board')
      return openCanvas($, page && board ? { page, board } : (page ?? board ?? ''))
    }
    case 'page':
      return pageManifest($, need(args, 'page'))
    case 'comments':
      return listComments($, optional(args, 'status'), optional(args, 'page'))
    case 'reply':
      await api($, `/api/comments/${id}/reply`, {
        method: 'POST',
        body: { body: need(args, 'body'), author: 'claude', session: await $.session.id() },
      })
      return `Replied to ${id}.`
    case 'resolve': {
      const body = optional(args, 'body')
      if (body) {
        await api($, `/api/comments/${id}/reply`, {
          method: 'POST',
          body: { body, author: 'claude', session: await $.session.id() },
        })
      }
      await api($, `/api/comments/${id}`, { method: 'PATCH', body: { status: 'resolved' } })
      return `Resolved ${id}.`
    }
    case 'check':
      return check($, optional(args, 'board'), optional(args, 'page'))
    case 'doctor':
      return doctorLines(await runDoctor($))
    default:
      throw new CanvasError(`unknown action ${String(args.action)}`)
  }
}
