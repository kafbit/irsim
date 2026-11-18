import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as claimRoute } from '../src/app/api/comments/claim/route'
import { POST } from '../src/app/api/page-requests/route'
import { upsertSession } from '../src/lib/comments-store'

const post = (handler: typeof POST, body: unknown) =>
  handler(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }))

describe('page requests route', () => {
  let root: string
  const saved = { data: process.env.IRSIM_DATA_DIR, design: process.env.IRSIM_DESIGN_DIR }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'page-requests-'))
    const design = join(root, 'design')
    mkdirSync(design)
    writeFileSync(join(design, 'canvas.json'), JSON.stringify({ pages: [{ id: 'sales', title: 'Sales', boards: [] }] }))
    process.env.IRSIM_DATA_DIR = join(root, 'data')
    process.env.IRSIM_DESIGN_DIR = design
  })
  afterEach(() => {
    for (const [key, value] of [
      ['IRSIM_DATA_DIR', saved.data],
      ['IRSIM_DESIGN_DIR', saved.design],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('answers 400 for bad input', async () => {
    expect((await post(POST, { page: 'sales', kind: 'icon' })).status).toBe(400)
    expect((await post(POST, { sessionId: 's1', kind: 'icon' })).status).toBe(400)
    expect((await post(POST, { sessionId: 's1', page: 'sales', kind: 'other' })).status).toBe(400)
    expect((await post(POST, { sessionId: 's1', page: 'missing', kind: 'icon' })).status).toBe(400)
  })

  it('answers 409 when the session is not live', async () => {
    const response = await post(POST, { sessionId: 's1', page: 'sales', kind: 'icon' })
    expect(response.status).toBe(409)
    expect(typeof ((await response.json()) as { error: string }).error).toBe('string')
  })

  it('queues the request and the next claim delivers it', async () => {
    await upsertSession({ id: 's1', label: 's', cwd: '/s' })
    const response = await post(POST, { sessionId: 's1', page: 'sales', kind: 'reorganize' })
    expect(response.status).toBe(200)
    const { id } = (await response.json()) as { id: string }
    const claimed = (await (await post(claimRoute, { sessionId: 's1' })).json()) as {
      count: number
      pages: { id: string; kind: string }[]
    }
    expect(claimed.count).toBe(1)
    expect(claimed.pages).toMatchObject([{ id, kind: 'reorganize' }])
  })
})
