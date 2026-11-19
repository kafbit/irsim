import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../src/app/b/[board]/route'

describe('GET /b/[board] with a shared folder', () => {
  const saved = process.env.IRSIM_DESIGN_DIR
  let dir = ''

  const frame = async (board: string) => {
    const response = await GET(new Request(`http://x/b/${board}`), {
      params: Promise.resolve({ board }),
    })
    return response.text()
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frame-route-'))
    writeFileSync(
      join(dir, 'Root.dc.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body><x-dc>hi</x-dc></body></html>',
    )
    process.env.IRSIM_DESIGN_DIR = dir
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved
    rmSync(dir, { recursive: true, force: true })
  })

  it('has no shared style when the folder is missing', async () => {
    const html = await frame('Root')
    expect(html).not.toContain('data-irsim-shared')
    expect(html).toContain('"shared":[]')
  })

  it('injects the shared css right after <head> and lists the modules in the bundle', async () => {
    mkdirSync(join(dir, 'shared'))
    writeFileSync(join(dir, 'shared', 'base.css'), '.a{content:"</style>"}')
    writeFileSync(join(dir, 'shared', 'table-sort.js'), 'export const sort = 1')
    const html = await frame('Root')
    expect(html).toContain('<head><style data-irsim-shared>/* base.css */')
    expect(html).toContain('<\\/style>')
    expect(html).toContain('"shared":["table-sort.js"]')
  })
})
