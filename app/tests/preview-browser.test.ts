import { spawnSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import type { Browser } from 'playwright-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findBrowser } from '../src/lib/browser-path'

const LAUNCHER = resolve(__dirname, '../../bin/irsim')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

let dir = ''
let outRoot = ''
let out = ''
let server: Server | undefined
let browser: Browser | undefined

const board = (title: string, content: string) => `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${title}</title>
<script src="./support.js"></script></head><body>
<x-dc>${content}</x-dc>
<script type="text/x-dc" data-props='{}'>
class Component extends DCLogic { renderVals() { return {} } }
</script></body></html>`

const start = async (root: string): Promise<string> => {
  const created = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || '/').split('?')[0] || '/')
    const file = join(root, pathname === '/' ? '/index.html' : pathname)
    if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  server = created
  await new Promise<void>((done) => created.listen(0, '127.0.0.1', () => done()))
  const address = created.address()
  if (!address || typeof address === 'string') throw new Error('the server has no port')
  return `http://127.0.0.1:${address.port}`
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-preview-design-'))
  outRoot = mkdtempSync(join(tmpdir(), 'irsim-preview-out-'))
  out = join(outRoot, 'site')
})

afterEach(async () => {
  await browser?.close()
  browser = undefined
  if (server) {
    const closed = server
    server = undefined
    await new Promise<void>((done) => closed.close(() => done()))
  }
  rmSync(dir, { recursive: true, force: true })
  rmSync(outRoot, { recursive: true, force: true })
})

describe('preview viewer', () => {
  it('renders the board frames and follows a link between boards', async () => {
    const executablePath = findBrowser()
    if (!executablePath) return

    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'A.dc.html'),
      board('Board A', '<div>Board A <a id="go" href="B.dc.html">Go to B</a></div>'),
    )
    writeFileSync(
      join(dir, 'B.dc.html'),
      board('Board B', '<div>Board B <a id="back" href="A.dc.html">Back</a></div>'),
    )
    writeFileSync(
      join(dir, 'canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: 'main',
            title: 'Main',
            boards: [
              { name: 'A', title: 'Board A', x: 0, y: 0, width: 400, height: 300 },
              { name: 'B', title: 'Board B', x: 480, y: 0, width: 400, height: 300 },
            ],
          },
        ],
        overrides: { colors: {}, radius: {}, type: {} },
        bindings: {},
      }),
    )
    const exported = spawnSync(
      'node',
      [LAUNCHER, 'export', '--design-dir', dir, '--out', out, '--title', 'Viewer'],
      { encoding: 'utf8' },
    )
    expect(exported.status, exported.stderr).toBe(0)
    const url = await start(out)

    const { chromium } = await import('playwright-core')
    try {
      browser = await chromium.launch({ executablePath })
    } catch {
      return
    }
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(
      () => document.querySelectorAll('.pv-frame').length === 2,
      undefined,
      { timeout: 5000 },
    )
    await page.waitForTimeout(700)

    const frameA = page.frames().find((frame) => frame.url().endsWith('/b/A.html'))
    if (!frameA) throw new Error('the viewer did not mount board A')
    await frameA.click('#go', { timeout: 5000 })

    await page.waitForFunction(() => location.hash === '#/board/main/B', undefined, {
      timeout: 5000,
    })
    expect(await page.locator('.pv-bar h1').innerText()).toBe('Board B')

    let frameB = page.frames().find((frame) => frame.url().endsWith('/b/B.html'))
    for (let attempt = 0; !frameB && attempt < 50; attempt++) {
      await page.waitForTimeout(100)
      frameB = page.frames().find((frame) => frame.url().endsWith('/b/B.html'))
    }
    if (!frameB) throw new Error('the board view did not mount board B')
    await frameB.click('#back', { timeout: 5000 })
    await page.waitForFunction(() => location.hash === '#/board/main/A', undefined, {
      timeout: 5000,
    })
    expect(await page.locator('.pv-bar h1').innerText()).toBe('Board A')
    expect(errors).toEqual([])
  }, 30_000)
})
