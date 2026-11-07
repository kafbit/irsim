import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closureOf, importsOf } from '../src/lib/closure'

const realDir = join(import.meta.dir, '../../../design')

describe('importsOf', () => {
  it('lists each imported name once, in order', () => {
    const source = `<dc-import name="B" a="1"><dc-import name='A'><dc-import name="B">
      <dc-import name="Avatar" name="{{k.ownerName}}">`
    expect(importsOf(source)).toEqual(['B', 'A', 'Avatar'])
  })

  it('returns nothing for a board without imports', () => {
    expect(importsOf('<x-dc><div>no imports</div></x-dc>')).toEqual([])
  })
})

describe('closureOf on design/', () => {
  const previous = process.env.CANVAS_DESIGN_DIR
  beforeEach(() => {
    process.env.CANVAS_DESIGN_DIR = realDir
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.CANVAS_DESIGN_DIR
    else process.env.CANVAS_DESIGN_DIR = previous
  })

  it('Leads holds the root, Table and Sidebar, each source once', async () => {
    const { boards, missing } = await closureOf('Leads')
    const names = Object.keys(boards)
    expect(names[0]).toBe('Leads')
    expect(names).toContain('Table')
    expect(names).toContain('Sidebar')
    expect(new Set(names).size).toBe(names.length)
    expect(missing).toEqual([])
  })

  it('the hash is stable across two calls', async () => {
    const first = await closureOf('Leads')
    const second = await closureOf('Leads')
    expect(second.hash).toBe(first.hash)
    expect(first.hash).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('closureOf on a copy', () => {
  const previous = process.env.CANVAS_DESIGN_DIR
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'closure-'))
    process.env.CANVAS_DESIGN_DIR = dir
    writeFileSync(
      join(dir, 'Root.dc.html'),
      '<x-dc><dc-import name="Leaf"><dc-import name="Gone"></x-dc>',
    )
    writeFileSync(join(dir, 'Leaf.dc.html'), '<x-dc>leaf</x-dc>')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (previous === undefined) delete process.env.CANVAS_DESIGN_DIR
    else process.env.CANVAS_DESIGN_DIR = previous
  })

  it('lists a missing import instead of throwing', async () => {
    const { boards, missing } = await closureOf('Root')
    expect(Object.keys(boards)).toEqual(['Root', 'Leaf'])
    expect(missing).toEqual(['Gone'])
  })

  it('the hash changes when an imported board changes, and the new source is served', async () => {
    const before = await closureOf('Root')
    writeFileSync(join(dir, 'Leaf.dc.html'), '<x-dc>leaf changed</x-dc>')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'Leaf.dc.html'), later, later)
    const after = await closureOf('Root')
    expect(after.hash).not.toBe(before.hash)
    expect(after.boards.Leaf).toContain('changed')
  })

  it('a missing import that appears joins the closure', async () => {
    await closureOf('Root')
    writeFileSync(join(dir, 'Gone.dc.html'), '<x-dc>here now</x-dc>')
    const { boards, missing } = await closureOf('Root')
    expect(Object.keys(boards)).toContain('Gone')
    expect(missing).toEqual([])
  })
})
