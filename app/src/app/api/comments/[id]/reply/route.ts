import { bad, isText, readBody } from '../../../../../lib/comments-input'
import { addReply } from '../../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { author } = body
  if (!isText(body.body)) return bad('body must be text')
  if (author !== 'claude' && author !== 'user') return bad('author must be claude or user')
  const { id } = await params
  const result = await addReply(id, {
    author,
    body: body.body,
    ...(author === 'claude' && isText(body.session) ? { session: body.session } : {}),
  })
  if (!result.ok) {
    const refusal = {
      not_found: ['comment not found', 404],
      is_draft: ['a draft is edited, not replied to', 409],
      no_session: ['the comment has no session to receive a reply', 409],
      not_draft: ['the comment is not a draft', 409],
    } as const
    const [error, status] = refusal[result.reason]
    return Response.json({ error }, { status })
  }
  return Response.json(result.value)
}
