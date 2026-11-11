import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closureOf } from '../../../../lib/closure'
import { thumbFile, thumbsDir } from '../../../../lib/thumbs-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The thumbnail of a board for its current closure hash. A file of an older hash is never served:
 * the response is 404 until `irsim thumbs` renders the board again. With `?h=` equal to the
 * current hash the URL names its content, so it is cached as immutable.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const { board } = await params
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(board)) {
    return new Response('invalid board name', { status: 400 })
  }
  const { boards, hash } = await closureOf(board)
  if (boards[board] === undefined) {
    return new Response(`no board named ${board}`, { status: 404 })
  }
  const bytes = await readFile(join(thumbsDir(), thumbFile(board, hash))).catch(() => null)
  if (bytes === null) return new Response('no thumbnail for the current version', { status: 404 })
  const requested = new URL(request.url).searchParams.get('h')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': requested === hash ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  })
}
