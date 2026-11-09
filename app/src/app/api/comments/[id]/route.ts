import { bad, hasUnknownImage, isText, parseImages, readBody } from '../../../../lib/comments-input'
import { deleteComment, updateComment, type Refusal } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const refusal = (reason: 'not_found' | Refusal): Response =>
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
  const images = body.images === undefined ? undefined : parseImages(body.images)
  if (typeof images === 'string') return bad(images)
  if (body.body === undefined && body.status === undefined && images === undefined)
    return bad('send body, status or images')
  if (images && (await hasUnknownImage(images))) return bad('unknown image')
  const { id } = await params
  const result = await updateComment(id, {
    body: body.body as string | undefined,
    images,
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
