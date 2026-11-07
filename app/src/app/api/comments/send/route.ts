import { bad, isText, readBody } from '../../../../lib/comments-input'
import { sendDrafts } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { sessionId, page } = body
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (page !== undefined && !isText(page)) return bad('page must be text')
  return Response.json(await sendDrafts({ sessionId, page }))
}
