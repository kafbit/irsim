import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readCanvasPages } from '../../../lib/canvas-pages'
import { selfBase } from '../../../lib/check-route'
import { closureOf } from '../../../lib/closure'
import { clearThumbFailure, enqueueThumb, thumbFailure } from '../../../lib/thumbs'
import { thumbFile, thumbsDir } from '../../../lib/thumbs-dir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Body = { page?: unknown; board?: unknown; force?: unknown }

const present = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  )

/**
 * Queues the thumbnails of a page, of one board or of the whole canvas that are missing, or all of
 * them with `force`. The body is `{ page?, board?, force? }`; the answer counts the boards queued,
 * already present and failed.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Body
  const page = typeof body.page === 'string' ? body.page : undefined
  const board = typeof body.board === 'string' ? body.board : undefined
  const force = body.force === true
  const pages = await readCanvasPages()
  if (page !== undefined && !pages.some((candidate) => candidate.id === page)) {
    return Response.json({ error: `no page named ${page}` }, { status: 400 })
  }
  const targets = pages
    .filter((candidate) => page === undefined || candidate.id === page)
    .flatMap((candidate) => candidate.boards)
    .filter((candidate) => board === undefined || candidate.name === board)
  if (board !== undefined && targets.length === 0) {
    return Response.json({ error: `no board named ${board}` }, { status: 400 })
  }
  const base = selfBase(request)
  const counts = { queued: 0, present: 0, failed: 0 }
  for (const target of targets) {
    const { hash } = await closureOf(target.name)
    const file = join(thumbsDir(), thumbFile(target.name, hash))
    if (force) {
      await rm(file, { force: true })
      clearThumbFailure(target.name, hash)
    } else if (await present(file)) {
      counts.present += 1
      continue
    } else if (thumbFailure(target.name, hash)) {
      counts.failed += 1
      continue
    }
    if ((await enqueueThumb(target.name, base)) === 'queued') counts.queued += 1
    else counts.failed += 1
  }
  return Response.json(counts)
}
