import { describe, expect, it } from 'vitest'
import { lintLines } from '../../plugin/hooks/api'
import type { Engine } from '../../plugin/hooks/api'
import { TOOL_SCHEMA, runTool } from '../../plugin/hooks/tool'

const problems = [
  { severity: 'error', file: 'design/canvas.json', path: 'pages[0].boards[0]', rule: 'board-title', message: 'the board has no title', fix: 'irsim lint --fix' },
  { severity: 'warning', file: 'design/Leads.html', path: 'title', rule: 'title-empty', message: 'the title is empty' },
] as const

type Routes = Record<string, { status?: number; body: unknown }>

const engine = (routes: Routes): { $: Engine; paths: string[] } => {
  const paths: string[] = []
  const $ = {
    env: { get: async (name: string) => (name === 'IRSIM_PORT' ? '3999' : undefined) },
    session: { cwd: async () => '/work', id: async () => 's1' },
    process: { run: async () => ({ exitCode: 0, stdout: '/work', stderr: '' }) },
    http: {
      fetch: async (url: string) => {
        const path = new URL(url).pathname
        paths.push(path)
        const route = routes[path]
        if (!route) throw new Error('connection refused')
        const status = route.status ?? 200
        return { status, ok: status < 400, headers: {}, text: JSON.stringify(route.body) }
      },
    },
  } as unknown as Engine
  return { $, paths }
}

describe('design_canvas lint', () => {
  it('has lint in the action enum', () => {
    expect(TOOL_SCHEMA.properties.action.enum).toContain('lint')
  })

  it('formats one line per problem and a count', () => {
    expect(lintLines({ ok: false, problems: [...problems] })).toBe(
      [
        'error design/canvas.json pages[0].boards[0] board-title: the board has no title (fix: irsim lint --fix)',
        'warning design/Leads.html title title-empty: the title is empty',
        '1 error, 1 warning',
      ].join('\n'),
    )
  })

  it('says the folder passes when there are no problems', async () => {
    const { $ } = engine({ '/api/lint': { body: { ok: true, problems: [] } } })
    expect(await runTool($, { action: 'lint' })).toBe('The design folder passes the lint.')
  })

  it('calls GET /api/lint for the lint action', async () => {
    const { $, paths } = engine({ '/api/lint': { body: { ok: false, problems: [...problems] } } })
    expect(await runTool($, { action: 'lint' })).toContain('1 error, 1 warning')
    expect(paths).toEqual(['/api/lint'])
  })

  it('puts the problems before the check output', async () => {
    const { $ } = engine({
      '/api/lint': { body: { ok: false, problems: [...problems] } },
      '/api/boards/Leads/check': { body: [{ board: 'Leads', ok: true, ms: 5, errors: [], warnings: [] }] },
    })
    const text = await runTool($, { action: 'check', board: 'Leads' })
    expect(text.split('\n')[0]).toBe('Format problems:')
    expect(text.endsWith('Leads ok 5 ms · no screenshot')).toBe(true)
    expect(text).toContain('1 error, 1 warning')
  })

  it('leaves the check output alone when the lint is clean, missing or failing', async () => {
    const check = { '/api/boards/Leads/check': { body: [{ board: 'Leads', ok: true, ms: 5, errors: [], warnings: [] }] } }
    for (const lint of [
      { '/api/lint': { body: { ok: true, problems: [] } } },
      { '/api/lint': { status: 404, body: { error: 'not found' } } },
      {},
    ]) {
      const { $ } = engine({ ...check, ...lint })
      expect(await runTool($, { action: 'check', board: 'Leads' })).toBe('Leads ok 5 ms · no screenshot')
    }
  })
})
