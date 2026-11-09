import { bad, hasUnknownImage, parseNewComment, readBody } from '../../../lib/comments-input'
import { createComment, listComments } from '../../../lib/comments-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
  return Response.json(
    await listComments({
      status: query.get('status') ?? undefined,
      page: query.get('page') ?? undefined,
      board: query.get('board') ?? undefined,
      session: query.get('session') ?? undefined,
    }),
  )
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = parseNewComment(body)
  if (typeof input === 'string') return bad(input)
  if (await hasUnknownImage(input.images ?? [])) return bad('unknown image')
  return Response.json(await createComment(input), { status: 201 })
}
