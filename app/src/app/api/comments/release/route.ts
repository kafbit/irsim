import { bad, isRecord, isText, readBody } from '../../../../lib/comments-input'
import { release } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

const isReplies = (value: unknown): value is { comment: string; at: string }[] =>
  Array.isArray(value) &&
  value.every((one) => isRecord(one) && typeof one.comment === 'string' && typeof one.at === 'string')

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  if (!isText(body.sessionId)) return bad('sessionId must be text')
  const { comments = [], approvals = [], variants = [], pages = [], replies = [] } = body
  if (!isIds(comments) || !isIds(approvals) || !isIds(variants) || !isIds(pages))
    return bad('comments, approvals, variants and pages must be lists of ids')
  if (!isReplies(replies)) return bad('replies must be a list of comment and at')
  await release(body.sessionId, { comments, approvals, variants, pages, replies })
  return Response.json({ ok: true })
}
