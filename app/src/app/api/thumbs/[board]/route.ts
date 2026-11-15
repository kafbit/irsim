import { readFile, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { BOARD_NAME } from '../../../../lib/board-name'
import { selfBase } from '../../../../lib/check-route'
import { closureOf } from '../../../../lib/closure'
import { enqueueThumb, thumbFailure, thumbKeyOf } from '../../../../lib/thumbs'
import { thumbFile, thumbsDir } from '../../../../lib/thumbs-dir'
import { newestOlderThumb, recordThumbIfMissing } from '../../../../lib/thumbs-index'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000

const touchWhenOld = (path: string): void => {
  void stat(path)
    .then((info) => {
      if (Date.now() - info.mtimeMs <= TOUCH_AFTER_MS) return
      const now = new Date()
      return utimes(path, now, now)
    })
    .catch(() => {})
}

/**
 * The thumbnail of a board for its current thumbnail key (closure render hash and size). When that
 * file is missing and an older one of the board exists, the older one is served with
 * `X-Thumb-Stale: 1` and `no-cache`, and the current render is queued. With no older file the response is 202 `pending`; the
 * `thumb` event announces the result. The response is 404 with the reason once a render failed in
 * this process. With `?h=` equal to the current thumbnail key the URL names its content, so it is
 * cached as immutable. A served file older than 24 h gets its mtime refreshed, so pruning keeps it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  const { board } = await params
  if (!BOARD_NAME.test(board)) {
    return new Response('invalid board name', { status: 400, headers: NO_STORE })
  }
  const { boards } = await closureOf(board)
  if (boards[board] === undefined) {
    return new Response(`no board named ${board}`, { status: 404, headers: NO_STORE })
  }
  const { key } = await thumbKeyOf(board)
  const current = join(thumbsDir(), thumbFile(key))
  const bytes = await readFile(current).catch(() => null)
  if (bytes === null) {
    const failure = thumbFailure(board, key)
    if (failure) return new Response(failure, { status: 404, headers: NO_STORE })
    const queued = await enqueueThumb(board, selfBase(request))
    const older = await newestOlderThumb(board, key)
    if (older !== undefined) {
      const path = join(thumbsDir(), thumbFile(older))
      const stale = await readFile(path).catch(() => null)
      if (stale !== null) {
        touchWhenOld(path)
        return new Response(new Uint8Array(stale), {
          headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache', 'X-Thumb-Stale': '1' },
        })
      }
    }
    if (queued === 'failed') {
      return new Response(thumbFailure(board, key) ?? 'thumbnail render failed', {
        status: 404,
        headers: NO_STORE,
      })
    }
    return new Response('pending', { status: 202, headers: NO_STORE })
  }
  touchWhenOld(current)
  void recordThumbIfMissing(board, key).catch(() => {})
  const requested = new URL(request.url).searchParams.get('h')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': requested === key ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  })
}
