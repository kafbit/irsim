import { bad, hasUnknownImage, isText, parseImages, readBody } from '../../../lib/comments-input'
import type { VariantPick } from '../../../lib/comments-types'
import { createVariantRequest, isSessionLive } from '../../../lib/comments-store'
import { MAX_OPTIONS, MAX_PRESETS, createVariants, discardVariants, isFailure } from '../../../lib/variants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_NOTE = 2000

const NO_SESSION = 'That Claude session is not running. Run /irsim in Claude Code, then generate.'

const isPick = (value: unknown): value is VariantPick => {
  if (typeof value !== 'object' || value === null) return false
  const pick = value as Record<string, unknown>
  const element = pick.element as Record<string, unknown> | null
  return (
    typeof pick.file === 'string' &&
    typeof pick.line === 'number' &&
    typeof element === 'object' &&
    element !== null &&
    typeof element.tag === 'string' &&
    typeof element.path === 'string' &&
    typeof element.text === 'string'
  )
}

/**
 * `{ page, board, presets, note?, images?, sessionId }` copies the board once per preset.
 * `{ page, board, count, note, pick?, images?, sessionId }` copies it `count` times with no preset.
 * Either way the session is asked to edit the copies.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body instanceof Response) return body
  const { page, board, presets, count, note, pick, sessionId } = body
  const images = parseImages(body.images)
  if (typeof images === 'string') return bad(images)
  if (!isText(page)) return bad('page must be text')
  if (!isText(board)) return bad('board must be text')
  if (!isText(sessionId)) return bad('sessionId must be text')
  if (note !== undefined && typeof note !== 'string') return bad('note must be text')
  if ((note ?? '').length > MAX_NOTE) return bad(`note must be at most ${MAX_NOTE} characters`)
  const free = count !== undefined && presets === undefined
  if (free) {
    if (count !== 2 && count !== 3) return bad(`count must be 2 to ${MAX_OPTIONS}`)
    if (typeof note !== 'string' || note.trim() === '') return bad('note must not be empty')
    if (pick !== undefined && !isPick(pick)) return bad('pick must be a picked element')
  } else {
    if (!Array.isArray(presets) || !presets.every((preset) => typeof preset === 'string')) {
      return bad('presets must be a list of preset names')
    }
    if (presets.length < 1 || presets.length > MAX_PRESETS) {
      return bad(`presets must hold 1 to ${MAX_PRESETS} names`)
    }
  }
  if (await hasUnknownImage(images)) return bad('unknown image')
  if (!(await isSessionLive(sessionId))) return Response.json({ error: NO_SESSION }, { status: 409 })
  const result = await createVariants(free ? { page, board, options: count as number } : { page, board, presets: presets as string[] })
  if (isFailure(result)) return Response.json({ error: result.error }, { status: result.status })
  const names = result.boards.map((entry) => entry.name)
  let queued: Awaited<ReturnType<typeof createVariantRequest>>
  try {
    queued = await createVariantRequest({
      page,
      base: board,
      variants: result.boards.map(({ name, label, direction }) => ({ name, label, direction })),
      note: (note ?? '').trim(),
      ...(images.length > 0 ? { images } : {}),
      ...(free && isPick(pick)
        ? { pick: { file: pick.file, line: pick.line, element: { ...pick.element } } }
        : {}),
      sessionId,
    })
  } catch (error) {
    await discardVariants({ page, base: board, names })
    throw error
  }
  if (queued === 'no_session') {
    await discardVariants({ page, base: board, names })
    return Response.json({ error: NO_SESSION }, { status: 409 })
  }
  return Response.json({ boards: result.boards.map((entry) => entry.board) }, { status: 201 })
}
