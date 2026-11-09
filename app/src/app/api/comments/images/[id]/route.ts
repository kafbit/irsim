import { IMAGE_ID, readImage } from '../../../../../lib/comment-images'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  if (!IMAGE_ID.test(id)) return Response.json({ error: 'invalid image id' }, { status: 400 })
  const image = await readImage(id)
  if (!image) return Response.json({ error: 'image not found' }, { status: 404 })
  return new Response(Buffer.from(image.bytes), {
    headers: {
      'content-type': image.type,
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
