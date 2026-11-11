import { NO_CHROMIUM, checkBoards, type BoardTarget } from './board-check'
import type { CanvasBoard } from './canvas-pages'

/** A board that is on disk but not yet in canvas.json gets this size. */
export const DEFAULT_SIZE = { width: 1440, height: 900 }

export const BOARD_NAME = /^[A-Za-z][A-Za-z0-9]*$/

export const targetOf = (name: string, placed?: CanvasBoard): BoardTarget => ({
  name,
  width: placed?.width ?? DEFAULT_SIZE.width,
  height: placed?.height ?? DEFAULT_SIZE.height,
})

/** The server checks itself: the board pages come from the port this request reached. */
export const selfBase = (request: Request): string => {
  const url = new URL(request.url)
  return `http://localhost:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
}

export const runChecks = async (request: Request, targets: BoardTarget[]): Promise<Response> => {
  try {
    return Response.json(await checkBoards(selfBase(request), targets))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: message === NO_CHROMIUM ? 503 : 500 })
  }
}
