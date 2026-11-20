import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closureOf, importsOf } from '../src/lib/closure'

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

describe('closureOf on a copy', () => {
  const previous = process.env.IRSIM_DESIGN_DIR
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'closure-'))
    process.env.IRSIM_DESIGN_DIR = dir
    writeFileSync(
      join(dir, 'Root.dc.html'),
      '<x-dc><dc-import name="Leaf"><dc-import name="Gone"></x-dc>',
    )
    writeFileSync(join(dir, 'Leaf.dc.html'), '<x-dc>leaf</x-dc>')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (previous === undefined) delete process.env.IRSIM_DESIGN_DIR
    else process.env.IRSIM_DESIGN_DIR = previous
  })

  it('lists a missing import instead of throwing', async () => {
    const { boards, missing } = await closureOf('Root')
    expect(Object.keys(boards)).toEqual(['Root', 'Leaf'])
    expect(missing).toEqual(['Gone'])
  })

  it('the hash is stable across two calls', async () => {
    const first = await closureOf('Root')
    const second = await closureOf('Root')
    expect(second.hash).toBe(first.hash)
    expect(first.hash).toMatch(/^[0-9a-f]{12}$/)
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

  it('render ignores the root name and follows the sources', async () => {
    writeFileSync(
      join(dir, 'Copy.dc.html'),
      '<x-dc><dc-import name="Leaf"><dc-import name="Gone"></x-dc>',
    )
    const root = await closureOf('Root')
    const copy = await closureOf('Copy')
    expect(root.render).toMatch(/^[0-9a-f]{12}$/)
    expect(copy.render).toBe(root.render)
    expect(copy.content).not.toBe(root.content)
    writeFileSync(join(dir, 'Leaf.dc.html'), '<x-dc>leaf changed</x-dc>')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'Leaf.dc.html'), later, later)
    expect((await closureOf('Root')).render).not.toBe(root.render)
  })

  it('lists the shared css and modules, and a css change moves hash, content and render', async () => {
    mkdirSync(join(dir, 'shared'))
    writeFileSync(join(dir, 'shared', 'base.css'), '.a{color:red}')
    writeFileSync(join(dir, 'shared', 'format.js'), 'export const money = (n) => n')
    writeFileSync(join(dir, 'shared', '.hidden.css'), '.h{}')
    const before = await closureOf('Root')
    expect(before.shared.css).toBe('/* base.css */\n.a{color:red}\n')
    expect(before.shared.modules).toEqual(['format.js'])
    writeFileSync(join(dir, 'shared', 'base.css'), '.a{color:blue}')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'shared', 'base.css'), later, later)
    const after = await closureOf('Root')
    expect(after.shared.css).toContain('blue')
    expect(after.hash).not.toBe(before.hash)
    expect(after.content).not.toBe(before.content)
    expect(after.render).not.toBe(before.render)
  })

  it('has an empty shared part when the folder is missing', async () => {
    const { shared } = await closureOf('Root')
    expect(shared).toEqual({ css: '', modules: [] })
  })

  it('a missing import that appears joins the closure', async () => {
    await closureOf('Root')
    writeFileSync(join(dir, 'Gone.dc.html'), '<x-dc>here now</x-dc>')
    const { boards, missing } = await closureOf('Root')
    expect(Object.keys(boards)).toContain('Gone')
    expect(missing).toEqual([])
  })
})
