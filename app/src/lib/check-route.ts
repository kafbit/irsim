import { NO_CHROMIUM, checkBoards, type BoardTarget } from './board-check'
import type { CanvasBoard } from './canvas-pages'

/** A board that is on disk but not yet in canvas.json gets this size. */
export const DEFAULT_SIZE = { width: 1440, height: 900 }

export const targetOf = (name: string, placed?: CanvasBoard): BoardTarget => ({
  name,
  width: placed?.width ?? DEFAULT_SIZE.width,
  height: placed?.height ?? DEFAULT_SIZE.height,
})

/**
 * The server checks itself on the port it listens on: `PORT`, which both `next dev --port` and
 * the standalone server set. The request's port is only a fallback, because a forwarded or
 * proxied URL names a port this machine may not serve.
 */
export const selfBase = (request: Request, port = process.env.PORT): string =>
  `http://localhost:${port || new URL(request.url).port}`

export const runChecks = async (request: Request, targets: BoardTarget[]): Promise<Response> => {
  try {
    return Response.json(await checkBoards(selfBase(request), targets))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message === NO_CHROMIUM ? 503 : 500 })
  }
}
