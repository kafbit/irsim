import { bad, isText, readBody } from '../../../../lib/comments-input'
import { sendDrafts } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { sessionId, page, ids } = body
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (page !== undefined && !isText(page)) return bad('page must be text')
  if (ids !== undefined && (!Array.isArray(ids) || ids.length === 0 || !ids.every(isText)))
    return bad('ids must be a list of comment ids')
  return Response.json(await sendDrafts({ sessionId, page, ids: ids as string[] | undefined }))
}
