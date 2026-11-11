import { projectRoot } from '../../../lib/design-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, version: 1, root: projectRoot() })
}
