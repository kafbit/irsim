import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BOARD_NAME } from '../../../../lib/board-name'
import { selfBase } from '../../../../lib/check-route'
import { closureOf } from '../../../../lib/closure'
import { enqueueThumb, thumbFailure } from '../../../../lib/thumbs'
import { thumbFile, thumbsDir } from '../../../../lib/thumbs-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * The thumbnail of a board for its current closure hash. A file of an older hash is never served.
 * When the file is missing the board is queued for rendering and the response is 202 `pending`;
 * the `thumb` event announces the result. The response is 404 with the reason once a render
 * failed in this process. With `?h=` equal to the current hash the URL names its content, so it is
 * cached as immutable.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const { board } = await params
  if (!BOARD_NAME.test(board)) {
    return new Response('invalid board name', { status: 400, headers: NO_STORE })
  }
  const { boards, hash } = await closureOf(board)
  if (boards[board] === undefined) {
    return new Response(`no board named ${board}`, { status: 404, headers: NO_STORE })
  }
  const bytes = await readFile(join(thumbsDir(), thumbFile(board, hash))).catch(() => null)
  if (bytes === null) {
    const failure = thumbFailure(board, hash)
    if (failure) return new Response(failure, { status: 404, headers: NO_STORE })
    if ((await enqueueThumb(board, selfBase(request))) === 'failed') {
      return new Response(thumbFailure(board, hash) ?? 'thumbnail render failed', {
        status: 404,
        headers: NO_STORE,
      })
    }
    return new Response('pending', { status: 202, headers: NO_STORE })
  }
  const requested = new URL(request.url).searchParams.get('h')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': requested === hash ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  })
}
