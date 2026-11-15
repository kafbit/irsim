import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as CHOOSE } from '../src/app/api/variants/choose/route'
import { POST } from '../src/app/api/variants/route'
import { claim, upsertSession } from '../src/lib/comments-store'
import { saveImage } from '../src/lib/comment-images'
import { closureOf } from '../src/lib/closure'
import { chooseVariant, createVariants, discardVariants } from '../src/lib/variants'

type Entry = Record<string, unknown>

describe('variants', () => {
  let root: string
  let design: string
  const saved = { data: process.env.IRSIM_DATA_DIR, design: process.env.IRSIM_DESIGN_DIR }

  const canvas = (): { pages: { sections?: Entry[]; boards: Entry[] }[] } =>
    JSON.parse(readFileSync(join(design, 'canvas.json'), 'utf8'))
  const source = (name: string) => readFileSync(join(design, `${name}.dc.html`), 'utf8')
  const writeCanvas = (value: unknown) => writeFileSync(join(design, 'canvas.json'), JSON.stringify(value))

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'variants-'))
    design = join(root, 'design')
    mkdirSync(design)
    writeFileSync(join(design, 'Leads.dc.html'), '<title>Leads</title><x-dc>leads</x-dc>')
    writeFileSync(join(design, 'Other.dc.html'), '<title>Other</title><x-dc>other</x-dc>')
    writeCanvas({
      version: 1,
      overrides: { colors: {}, radius: {}, type: {} },
      bindings: {},
      pages: [
        {
          id: 'sales',
          title: 'Sales',
          sections: [{ id: 'main', title: 'Main' }],
          boards: [
            { name: 'Leads', title: 'Leads', x: 100, y: 50, width: 400, height: 300, section: 'main' },
            { name: 'Other', title: 'Other', x: 0, y: 900, width: 400, height: 300 },
          ],
        },
      ],
    })
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

  const make = (presets = ['Better', 'UI/UX pass']) => createVariants({ page: 'sales', board: 'Leads', presets })

  it('copies the board per preset, lays them out in a row and groups them in a section', async () => {
    const result = await make()
    expect('boards' in result && result.boards.map((entry) => entry.name)).toEqual([
      'LeadsVariantBetter',
      'LeadsVariantUiUxPass',
    ])
    expect(source('LeadsVariantBetter')).toBe('<title>Leads: Better</title><x-dc>leads</x-dc>')
    expect(source('LeadsVariantUiUxPass')).toContain('<title>Leads: UI/UX pass</title>')
    const page = canvas().pages[0]
    expect(page?.boards[2]).toMatchObject({
      name: 'LeadsVariantBetter',
      x: 100 + 480,
      y: 50,
      width: 400,
      height: 300,
      variantOf: 'Leads',
      variantLabel: 'Better',
      section: 'leads-variants',
    })
    expect(page?.boards[3]).toMatchObject({ x: 100 + 960 })
    expect(typeof page?.boards[2]?.baseHash).toBe('string')
    expect(page?.boards[0]?.section).toBe('leads-variants')
    expect(page?.sections).toContainEqual({
      id: 'leads-variants',
      title: 'Leads variants',
      variantOf: 'Leads',
      baseSection: 'main',
    })
  })

  it('adds a numeric suffix on a name collision and continues the row', async () => {
    await make(['Better'])
    const again = await make(['Better'])
    expect('boards' in again && again.boards[0]?.name).toBe('LeadsVariantBetter2')
    expect(canvas().pages[0]?.boards[3]).toMatchObject({ x: 100 + 960 })
    expect(canvas().pages[0]?.sections?.filter((entry) => entry.variantOf === 'Leads')).toHaveLength(1)
  })

  it('refuses a variant of a variant, an unknown preset, a duplicate and a missing board', async () => {
    await make(['Better'])
    expect(await createVariants({ page: 'sales', board: 'LeadsVariantBetter', presets: ['Better'] })).toMatchObject({ status: 400 })
    expect(await createVariants({ page: 'sales', board: 'Leads', presets: ['Nope'] })).toMatchObject({ status: 400 })
    expect(await createVariants({ page: 'sales', board: 'Leads', presets: ['Simpler', 'Simpler'] })).toMatchObject({ status: 400 })
    expect(await createVariants({ page: 'sales', board: 'Leads', presets: [] })).toMatchObject({ status: 400 })
    expect(await createVariants({ page: 'sales', board: 'Missing', presets: ['Better'] })).toMatchObject({ status: 404 })
  })

  it('choosing a variant replaces the base source, keeps its title and removes the variants and the section', async () => {
    await make()
    writeFileSync(join(design, 'LeadsVariantBetter.dc.html'), '<title>Leads: Better</title><x-dc>better</x-dc>')
    const result = await chooseVariant({ page: 'sales', base: 'Leads', pick: 'LeadsVariantBetter' })
    expect(result).toEqual({ kept: 'LeadsVariantBetter' })
    expect(source('Leads')).toBe('<title>Leads</title><x-dc>better</x-dc>')
    expect(existsSync(join(design, 'LeadsVariantBetter.dc.html'))).toBe(false)
    expect(existsSync(join(design, 'LeadsVariantUiUxPass.dc.html'))).toBe(false)
    const page = canvas().pages[0]
    expect(page?.boards.map((entry) => entry.name)).toEqual(['Leads', 'Other'])
    expect(page?.sections).toEqual([{ id: 'main', title: 'Main' }])
    expect(page?.boards[0]?.section).toBe('main')
  })

  it('choosing the base discards the variants and drops the section field when there was none', async () => {
    const before = canvas()
    delete before.pages[0]?.boards[0]?.section
    writeCanvas(before)
    await make(['Simpler'])
    expect(await chooseVariant({ page: 'sales', base: 'Leads', pick: 'Leads' })).toEqual({ kept: 'Leads' })
    expect(source('Leads')).toBe('<title>Leads</title><x-dc>leads</x-dc>')
    expect(existsSync(join(design, 'LeadsVariantSimpler.dc.html'))).toBe(false)
    expect(canvas().pages[0]?.boards[0]).not.toHaveProperty('section')
  })

  it('refuses a pick that is not the base or a variant', async () => {
    await make(['Better'])
    expect(await chooseVariant({ page: 'sales', base: 'Leads', pick: 'Other' })).toMatchObject({ status: 400 })
  })

  it('answers 409 with the importer names when an outside board imports a variant', async () => {
    await make(['Better'])
    writeFileSync(join(design, 'Other.dc.html'), '<x-dc><dc-import name="LeadsVariantBetter"></dc-import></x-dc>')
    const result = await chooseVariant({ page: 'sales', base: 'Leads', pick: 'Leads' })
    expect(result).toMatchObject({ status: 409 })
    expect('error' in result && result.error).toContain('Other')
    expect(existsSync(join(design, 'LeadsVariantBetter.dc.html'))).toBe(true)
  })

  it('the route answers 409 without writing files when the session is not running', async () => {
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', presets: ['Better'], sessionId: 'gone' }),
      }),
    )
    expect(response.status).toBe(409)
    expect(existsSync(join(design, 'LeadsVariantBetter.dc.html'))).toBe(false)
  })

  it('the route queues a request that the next claim delivers once', async () => {
    await upsertSession({ id: 's1', label: 's1', cwd: '/w' })
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', presets: ['Simpler'], note: 'Tight.', sessionId: 's1' }),
      }),
    )
    expect(response.status).toBe(201)
    const first = await claim('s1')
    expect(first.count).toBe(1)
    expect(first.text).toContain('design/LeadsVariantSimpler.dc.html: Simpler.')
    expect(first.text).toContain('Tight.')
    expect((await claim('s1')).count).toBe(0)
  })

  const options = (count = 3) => createVariants({ page: 'sales', board: 'Leads', options: count })

  it('free-form mode names the copies Option1..N with titles and labels', async () => {
    const result = await options()
    expect('boards' in result && result.boards.map((entry) => entry.name)).toEqual([
      'LeadsVariantOption1',
      'LeadsVariantOption2',
      'LeadsVariantOption3',
    ])
    expect('boards' in result && result.boards.map((entry) => entry.label)).toEqual(['Option 1', 'Option 2', 'Option 3'])
    expect('boards' in result && result.boards[1]?.direction).toBe(
      "Option 2 of 3: a distinct take on the user's note. Make each option clearly different from the others.",
    )
    expect(source('LeadsVariantOption2')).toBe('<title>Leads: Option 2</title><x-dc>leads</x-dc>')
    const page = canvas().pages[0]
    expect(page?.boards[3]).toMatchObject({
      name: 'LeadsVariantOption2',
      x: 100 + 480 * 2,
      variantOf: 'Leads',
      variantLabel: 'Option 2',
      section: 'leads-variants',
    })
  })

  it('free-form mode takes the next free numbers when names are used', async () => {
    await options(2)
    const second = await options(2)
    expect('boards' in second && second.boards.map((entry) => entry.name)).toEqual([
      'LeadsVariantOption3',
      'LeadsVariantOption4',
    ])
    expect('boards' in second && second.boards.map((entry) => entry.label)).toEqual(['Option 1', 'Option 2'])
  })

  it('free-form mode rejects a count outside 2 to 3', async () => {
    expect(await options(4)).toMatchObject({ status: 400 })
    expect(existsSync(join(design, 'LeadsVariantOption1.dc.html'))).toBe(false)
  })

  it('the route stores the note and the pick of a free-form request', async () => {
    await upsertSession({ id: 's1', label: 's1', cwd: '/w' })
    const pick = { file: 'design/Leads.dc.html', line: 7, element: { tag: 'h1', path: 'h1', text: 'Leads' } }
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', count: 2, note: 'Calmer header.', pick, sessionId: 's1' }),
      }),
    )
    expect(response.status).toBe(201)
    const stored = JSON.parse(readFileSync(join(root, 'data', 'variant-requests.json'), 'utf8'))
    expect(stored[0]).toMatchObject({ note: 'Calmer header.', pick, base: 'Leads' })
    expect(stored[0].variants.map((entry: { name: string }) => entry.name)).toEqual([
      'LeadsVariantOption1',
      'LeadsVariantOption2',
    ])
    const claimed = await claim('s1')
    expect(claimed.text).toContain('design/Leads.dc.html:7 · h1 "Leads"')
    expect(claimed.text).toContain('Calmer header.')
  })

  it('the route rejects a free-form request without a note', async () => {
    await upsertSession({ id: 's1', label: 's1', cwd: '/w' })
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', count: 3, note: '  ', sessionId: 's1' }),
      }),
    )
    expect(response.status).toBe(400)
  })

  it('the choose route answers 200 with the kept board', async () => {
    await make(['Better'])
    const response = await CHOOSE(
      new Request('http://x/api/variants/choose', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', base: 'Leads', pick: 'Leads' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kept: 'Leads' })
  })

  it('stores the render hash of each copy as its baseHash', async () => {
    const result = await make()
    expect('boards' in result).toBe(true)
    const boards = canvas().pages[0]?.boards ?? []
    for (const name of ['LeadsVariantBetter', 'LeadsVariantUiUxPass']) {
      const stored = boards.find((entry) => entry.name === name)
      expect(stored?.baseHash).toBe((await closureOf(name)).render)
    }
  })

  it('discardVariants removes the named copies, their files and the emptied section, and restores the base section', async () => {
    const result = await make()
    const names = 'boards' in result ? result.boards.map((entry) => entry.name) : []
    expect(await discardVariants({ page: 'sales', base: 'Leads', names })).toBeNull()
    const page = canvas().pages[0]
    expect(page?.boards.map((entry) => entry.name)).toEqual(['Leads', 'Other'])
    expect(page?.sections).toEqual([{ id: 'main', title: 'Main' }])
    expect(page?.boards[0]?.section).toBe('main')
    for (const name of names) expect(existsSync(join(design, `${name}.dc.html`))).toBe(false)
  })

  it('discardVariants keeps the section while other variants remain', async () => {
    await make(['Better'])
    const second = await make(['Simpler'])
    const names = 'boards' in second ? second.boards.map((entry) => entry.name) : []
    await discardVariants({ page: 'sales', base: 'Leads', names })
    const page = canvas().pages[0]
    expect(page?.boards.map((entry) => entry.name)).toEqual(['Leads', 'Other', 'LeadsVariantBetter'])
    expect(page?.sections?.some((entry) => entry.variantOf === 'Leads')).toBe(true)
    expect(page?.boards[0]?.section).toBe('leads-variants')
    expect(existsSync(join(design, 'LeadsVariantBetter.dc.html'))).toBe(true)
    expect(existsSync(join(design, 'LeadsVariantSimpler.dc.html'))).toBe(false)
  })

  it('discardVariants drops the base section field when the old section is gone', async () => {
    const before = canvas()
    delete before.pages[0]?.boards[0]?.section
    writeCanvas(before)
    const result = await make(['Better'])
    await discardVariants({ page: 'sales', base: 'Leads', names: ['LeadsVariantBetter'] })
    expect('boards' in result).toBe(true)
    expect(canvas().pages[0]?.boards[0]).not.toHaveProperty('section')
    expect(canvas().pages[0]?.sections).toEqual([{ id: 'main', title: 'Main' }])
  })

  it('the route stores pasted images and the claim lists their paths', async () => {
    await upsertSession({ id: 's1', label: 's1', cwd: '/w' })
    const saved = await saveImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))
    const id = saved.ok ? saved.id : ''
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', count: 2, note: 'Like this.', images: [id], sessionId: 's1' }),
      }),
    )
    expect(response.status).toBe(201)
    const stored = JSON.parse(readFileSync(join(root, 'data', 'variant-requests.json'), 'utf8'))
    expect(stored[0].images).toEqual([id])
    const claimed = await claim('s1')
    expect(claimed.text).toContain(`   image: ${join(root, 'data', 'images', id)}.png`)
  })

  it('the route rejects an unknown image id without writing files', async () => {
    await upsertSession({ id: 's1', label: 's1', cwd: '/w' })
    const response = await POST(
      new Request('http://x/api/variants', {
        method: 'POST',
        body: JSON.stringify({ page: 'sales', board: 'Leads', presets: ['Better'], images: ['i_nope'], sessionId: 's1' }),
      }),
    )
    expect(response.status).toBe(400)
    expect(existsSync(join(design, 'LeadsVariantBetter.dc.html'))).toBe(false)
  })
})
