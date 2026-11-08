import { dirname } from 'node:path'
import { designDir } from '../../../lib/design-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, version: 1, root: dirname(designDir()) })
}
