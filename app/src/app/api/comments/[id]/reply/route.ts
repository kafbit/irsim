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
  const result = await addReply(id, { author, body: body.body })
  if (!result.ok) return Response.json({ error: 'comment not found' }, { status: 404 })
  return Response.json(result.value)
}
