import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/b/shared/[...path]/route'

describe('GET /b/shared/[...path]', () => {
  const saved = process.env.IRSIM_DESIGN_DIR
  let dir = ''

  const request = (path: string[], headers: Record<string, string> = {}) =>
    GET(new Request(`http://x/b/shared/${path.join('/')}`, { headers }), {
      params: Promise.resolve({ path }),
    })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shared-route-'))
    mkdirSync(join(dir, 'shared', 'ui'), { recursive: true })
    writeFileSync(join(dir, 'shared', 'base.css'), '.a{}')
    writeFileSync(join(dir, 'shared', 'ui', 'format.mjs'), 'export {}')
    writeFileSync(join(dir, 'shared', 'blob.bin'), 'x')
    process.env.IRSIM_DESIGN_DIR = dir
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves a file with its content type and no-cache', async () => {
    const response = await request(['base.css'])
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe('.a{}')
    expect((await request(['ui', 'format.mjs'])).headers.get('content-type')).toBe('text/javascript')
    expect((await request(['blob.bin'])).headers.get('content-type')).toBe('application/octet-stream')
  })

  it('answers 400 for a segment that leaves the folder or is hidden', async () => {
    expect((await request(['..', 'Root.dc.html'])).status).toBe(400)
    expect((await request(['.hidden'])).status).toBe(400)
    expect((await request(['ui', '..%2Fbase.css'])).status).toBe(400)
  })

  it('answers 404 for a missing file and for a folder', async () => {
    expect((await request(['nope.css'])).status).toBe(404)
    expect((await request(['ui'])).status).toBe(404)
  })

  it('answers 304 when the ETag matches', async () => {
    const first = await request(['base.css'])
    const etag = first.headers.get('etag') ?? ''
    const second = await request(['base.css'], { 'if-none-match': etag })
    expect(second.status).toBe(304)
  })
})
