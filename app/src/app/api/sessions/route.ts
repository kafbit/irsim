import { agentOf } from '../../../lib/agents'
import { bad, isText, readBody } from '../../../lib/comments-input'
import { sessionInfo } from '../../../lib/session-info'
import { listSessions, upsertSession } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const sessions = await listSessions()
  return Response.json(
    await Promise.all(sessions.map(async (session) => ({ ...session, ...(await sessionInfo(session)) }))),
  )
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { id, label, cwd, agent } = body
  if (!isText(id) || typeof label !== 'string' || typeof cwd !== 'string') {
    return bad('id must be text, label and cwd must be strings')
  }
  return Response.json(
    await upsertSession({ id, label, cwd, agent: agentOf(agent) }),
  )
}
