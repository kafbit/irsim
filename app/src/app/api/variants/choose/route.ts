import { bad, isText, readBody } from '../../../../lib/comments-input'
import { chooseVariant, isFailure } from '../../../../lib/variants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** `{ page, base, pick }`: keeps `pick` (a variant or the base itself) as the base board and removes the variants. */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { page, base, pick } = body
  if (!isText(page)) return bad('page must be text')
  if (!isText(base)) return bad('base must be text')
  if (!isText(pick)) return bad('pick must be text')
  const result = await chooseVariant({ page, base, pick })
  if (isFailure(result)) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result)
}
