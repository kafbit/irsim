import { bad, isText, readBody } from '../../../../lib/comments-input'
import { claim } from '../../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  if (!isText(body.sessionId)) return bad('sessionId must be text')
  return Response.json(await claim(body.sessionId))
}
