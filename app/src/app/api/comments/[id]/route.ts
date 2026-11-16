import { bad, hasUnknownImage, isText, parseImages, readBody } from '../../../../lib/comments-input'
import { deleteComment, updateComment, type Refusal } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const refusal = (reason: 'not_found' | Refusal): Response => {
  if (reason === 'not_found') return Response.json({ error: 'comment not found' }, { status: 404 })
  if (reason === 'is_draft')
    return Response.json({ error: 'a draft gets its session when it is sent' }, { status: 409 })
  return Response.json({ error: 'only a draft can be edited or deleted' }, { status: 409 })
}

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
  if (body.sessionId !== undefined && !isText(body.sessionId)) return bad('sessionId must be text')
  if (
    body.body === undefined &&
    body.status === undefined &&
    images === undefined &&
    body.sessionId === undefined
  )
    return bad('send body, status, images or sessionId')
  if (images && (await hasUnknownImage(images))) return bad('unknown image')
  const { id } = await params
  const result = await updateComment(id, {
    body: body.body as string | undefined,
    images,
    status: body.status as 'resolved' | undefined,
    sessionId: body.sessionId as string | undefined,
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
