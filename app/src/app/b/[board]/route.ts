import { closureOf } from '../../../lib/closure'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Injected as `window.__CANVAS_ENV__`; the runtime in `public/runtime/` reads it. */
type CanvasEnv = {
  board: string
  locale: 'ar' | 'en'
  rev: number
  tokens: Record<string, unknown>
  strings: Record<string, string>
  values: Record<string, Record<string, string>>
}

const envFor = (board: string): CanvasEnv => ({
  board,
  locale: 'ar',
  rev: 0,
  tokens: {},
  strings: {},
  values: {},
})

// Bump when the frame document's shape changes: the closure hash covers the boards, not this
// route, and a stale 304 hands the new runtime a document it cannot read.
const FORMAT = 'f2'

const matches = (header: string | null, etag: string): boolean =>
  header !== null &&
  header
    .split(',')
    .map((part) => part.trim().replace(/^W\//, ''))
    .some((part) => part === etag || part === '*')

/**
 * A board as the frame loads it: the root's head with `./support.js` pointed at our runtime, an
 * empty `<x-dc>`, the canvas env, the root source once in `<template id="dc-root">` (`&` and `<`
 * escaped, so no board text can end the template) and every imported board in `#dc-bundle`, so the
 * frame makes no further request. Tokens reach the source in the runtime, so a colour change also
 * moves hex values inside `<style>` and inside a component's own script.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ board: string }> },
): Promise<Response> {
  // Boards link to each other as `X.dc.html`, and a click loads that URL into the frame.
  const board = (await params).board.replace(/\.dc\.html$/, '')
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(board)) {
    return new Response('invalid board name', { status: 400 })
  }
  const { boards, missing, hash } = await closureOf(board)
  const source = boards[board]
  if (source === undefined) {
    return new Response(`no board named ${board}`, { status: 404 })
  }
  if (new URL(request.url).searchParams.get('raw') === '1') {
    return new Response(source, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  }
  const etag = `"${FORMAT}-${hash}"`
  const headers = { 'Cache-Control': 'no-cache', ETag: etag }
  if (matches(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers })
  }
  const escape = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
  const imports = Object.fromEntries(Object.entries(boards).filter(([name]) => name !== board))
  const bundle = escape({ root: board, boards: imports, missing })
  const open = source.search(/<x-dc[\s>]/)
  const shell = open < 0 ? source : `${source.slice(0, open)}<x-dc></x-dc>\n</body>\n</html>\n`
  const html = shell
    .replace(
      /<script\s+src="\.\/support\.js"\s*><\/script>/g,
      '<script type="module" src="/runtime/support.js"></script>',
    )
    .replace(
      '</head>',
      () =>
        `<script>window.__CANVAS_ENV__=${escape(envFor(board))}</script>` +
        `<script type="application/json" id="dc-bundle">${bundle}</script>` +
        `<template id="dc-root">${source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</template></head>`,
    )
  return new Response(html, {
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
