import { bad, isText, readBody } from '../../../lib/comments-input'
import { listSessions, upsertSession } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  return Response.json(await listSessions())
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { id, label, cwd } = body
  if (!isText(id) || typeof label !== 'string' || typeof cwd !== 'string') {
    return bad('id must be text, label and cwd must be strings')
  }
  return Response.json(await upsertSession({ id, label, cwd }))
}
