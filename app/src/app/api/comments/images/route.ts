import { MAX_IMAGE_BYTES, saveImage } from '../../../../lib/comment-images'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const REFUSAL = 'Only PNG, JPEG or WebP, up to 5 MB.'

const tooLarge = (): Response => Response.json({ error: REFUSAL }, { status: 413 })

const readLimited = async (request: Request): Promise<Uint8Array | null> => {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function POST(request: Request): Promise<Response> {
  const bytes = await readLimited(request)
  if (!bytes) return tooLarge()
  const saved = await saveImage(bytes)
  if (saved.ok) return Response.json({ id: saved.id }, { status: 201 })
  return saved.reason === 'size' ? tooLarge() : Response.json({ error: REFUSAL }, { status: 415 })
}
