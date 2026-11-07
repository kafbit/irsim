import { bad, isText, readBody } from '../../../../lib/comments-input'
import { deleteComment, updateComment } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const refusal = (reason: 'not_found' | 'not_draft'): Response =>
  reason === 'not_found'
    ? Response.json({ error: 'comment not found' }, { status: 404 })
    : Response.json({ error: 'only a draft can be edited or deleted' }, { status: 409 })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  if (body.body !== undefined && !isText(body.body)) return bad('body must be text')
  if (body.status !== undefined && body.status !== 'resolved')
    return bad('status may only be resolved')
  if (body.body === undefined && body.status === undefined) return bad('send body or status')
  const { id } = await params
  const result = await updateComment(id, {
    body: body.body as string | undefined,
    status: body.status as 'resolved' | undefined,
  })
  return result.ok ? Response.json(result.value) : refusal(result.reason)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const result = await deleteComment(id)
  return result.ok ? Response.json({ ok: true }) : refusal(result.reason)
}
