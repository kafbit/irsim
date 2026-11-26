import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as checkBoard } from '../src/app/api/boards/[board]/check/route'
import { POST as checkPage } from '../src/app/api/pages/[pageId]/check/route'
import { overflowWarnings, summarize, type Signals } from '../src/lib/board-check'
import { selfBase, targetOf } from '../src/lib/check-route'

const clean: Signals = {
  problems: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  empty: false,
  layout: [],
}

describe('summarize', () => {
  it('is ok with no signals and keeps the screenshot path', () => {
    expect(summarize('Leads', clean, 12, '/x/Leads.png')).toEqual({
      board: 'Leads',
      ok: true,
      ms: 12,
      errors: [],
      warnings: [],
      screenshot: '/x/Leads.png',
    })
  })

  it('lists the fatal error first, drops runtime echoes and duplicates', () => {
    const result = summarize(
      'Leads',
      {
        ...clean,
        fatal: 'board error: boom',
        problems: ['render: x is undefined'],
        consoleErrors: ['[canvas:render] x is undefined', 'other failure'],
        pageErrors: ['other failure'],
        failedRequests: ['404 http://localhost:1/a.png'],
      },
      5,
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      'board error: boom',
      'render: x is undefined',
      'other failure',
      '404 http://localhost:1/a.png',
    ])
    expect(result.screenshot).toBeUndefined()
  })

  it('drops the boot error, page errors and console lines that repeat another signal', () => {
    const result = summarize(
      'Boot',
      {
        ...clean,
        fatal: 'board error: boom',
        problems: ['boot: boom', 'window: late'],
        pageErrors: ['late'],
        consoleErrors: ['Failed to load resource: the server responded with a status of 404 ()'],
        failedRequests: ['404 http://localhost:1/a.png'],
      },
      1,
    )
    expect(result.errors).toEqual(['boot: boom', 'window: late', '404 http://localhost:1/a.png'])
  })

  it('an empty render is a warning and not ok', () => {
    const result = summarize('Blank', { ...clean, empty: true }, 1)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual(['the board renders no text and no image'])
  })

  it('a cut-off board is a warning and not ok', () => {
    const warning = 'layout: the content is 900 px tall, the frame is 600 px, and 300 px are cut off'
    const result = summarize('Tall', { ...clean, layout: [warning] }, 1)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([warning])
  })
})

describe('overflowWarnings', () => {
  it('reports nothing up to the tolerance and one warning past it', () => {
    const frame = { width: 800, height: 600 }
    expect(overflowWarnings({ width: 800, height: 600 }, frame)).toEqual([])
    expect(overflowWarnings({ width: 600, height: 602 }, frame)).toEqual([])
    expect(overflowWarnings({ width: 803, height: 600 }, frame)).toHaveLength(1)
  })

  it('names each cut off axis with the pixels lost, wide before tall', () => {
    expect(overflowWarnings({ width: 874, height: 600 }, { width: 800, height: 600 })).toEqual([
      'layout: the content is 874 px wide, the frame is 800 px, and 74 px are cut off',
    ])
    expect(overflowWarnings({ width: 900, height: 800 }, { width: 800, height: 600 })).toEqual([
      'layout: the content is 900 px wide, the frame is 800 px, and 100 px are cut off',
      'layout: the content is 800 px tall, the frame is 600 px, and 200 px are cut off',
    ])
  })

  it('ignores a measurement that is not a finite number', () => {
    expect(
      overflowWarnings(
        { width: Number.NaN, height: Number.POSITIVE_INFINITY },
        { width: 800, height: 600 },
      ),
    ).toEqual([])
  })
})

describe('check helpers', () => {
  it('a board missing from canvas.json gets the default size', () => {
    expect(targetOf('New')).toEqual({ name: 'New', width: 1440, height: 900 })
    expect(
      targetOf('Leads', { name: 'Leads', title: 'Leads', x: 0, y: 0, width: 390, height: 844 }),
    ).toEqual({ name: 'Leads', width: 390, height: 844 })
  })

  it('the server checks itself on its own port, the request port only as a fallback', () => {
    const forwarded = new Request('http://example.test:8080/api/boards/A/check')
    expect(selfBase(forwarded, '3238')).toBe('http://localhost:3238')
    expect(selfBase(forwarded, '')).toBe('http://localhost:8080')
  })
})

describe('check routes', () => {
  let root: string
  const saved = process.env.IRSIM_DESIGN_DIR

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-route-'))
    const design = join(root, 'design')
    mkdirSync(design)
    writeFileSync(join(design, 'Tiny.dc.html'), '<x-dc>tiny</x-dc>')
    writeFileSync(
      join(design, 'canvas.json'),
      JSON.stringify({ pages: [{ id: 'empty', title: 'Empty', boards: [] }] }),
    )
    process.env.IRSIM_DESIGN_DIR = design
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = saved
    rmSync(root, { recursive: true, force: true })
  })

  const board = (name: string) =>
    checkBoard(new Request(`http://x:1/api/boards/${name}/check`, { method: 'POST' }), {
      params: Promise.resolve({ board: name }),
    })
  const page = (pageId: string) =>
    checkPage(new Request(`http://x:1/api/pages/${pageId}/check`, { method: 'POST' }), {
      params: Promise.resolve({ pageId }),
    })

  it('400 for an invalid name and 404 for an unknown board', async () => {
    expect((await board('../x')).status).toBe(400)
    expect((await board('Nope')).status).toBe(404)
  })

  it('404 for an unknown page and an empty list for a page with no boards', async () => {
    expect((await page('nope')).status).toBe(404)
    const response = await page('empty')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })
})
