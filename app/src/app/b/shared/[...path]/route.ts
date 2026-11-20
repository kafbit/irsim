import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { sharedDir } from '../../../../lib/shared-folder'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
}

const unsafe = (segment: string): boolean =>
  segment === '' || segment === '.' || segment === '..' || segment.startsWith('.') || segment.includes('\\')

const matches = (header: string | null, etag: string): boolean =>
  header !== null &&
  header
    .split(',')
    .map((part) => part.trim().replace(/^W\//, ''))
    .some((part) => part === etag || part === '*')

/** A file of `design/shared/`, served as it is so a board can reference it as `./shared/<path>`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const segments = (await params).path.map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return ''
    }
  })
  if (segments.length === 0 || segments.some(unsafe) || segments.some((s) => s.includes('/'))) {
    return new Response('invalid path', { status: 400 })
  }
  const file = join(sharedDir(), ...segments)
  let info
  try {
    info = await stat(file)
  } catch {
    return new Response('not found', { status: 404 })
  }
  if (!info.isFile()) return new Response('not found', { status: 404 })
  const etag = `"${info.mtimeMs}-${info.size}"`
  const headers = { 'Cache-Control': 'no-cache', ETag: etag }
  if (matches(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers })
  }
  const body = await readFile(file)
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  return new Response(new Uint8Array(body), { headers: { ...headers, 'Content-Type': type } })
}
