import { describe, expect, it } from 'vitest'
import { applyEdit, type CanvasFile, placeBoard } from '../src/lib/canvas-layout'

const canvas = (): CanvasFile => ({
  version: 1,
  pages: [
    {
      id: 'sales',
      title: 'Sales',
      boards: [
        { name: 'Leads', title: 'Leads', x: 0, y: 0, width: 1440, height: 900 },
        { name: 'Pipeline', title: 'Pipeline', x: 1600, y: 0, width: 1440, height: 900 },
      ],
    },
    {
      id: 'admin',
      title: 'Admin',
      boards: [{ name: 'Leads', title: 'Leads', x: 5, y: 6, width: 300, height: 300 }],
    },
  ],
  overrides: { colors: { a: 'b' }, radius: {}, type: {} },
  bindings: { x: 'y' },
})

const placed = (result: ReturnType<typeof placeBoard>): CanvasFile => {
  if ('error' in result) throw new Error(result.error)
  return result.canvas
}

describe('placeBoard', () => {
  it('moves a board', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Leads', { x: 40, y: -20, width: 1440, height: 900 }),
    )
    expect(result.pages[0]?.boards[0]).toEqual({
      name: 'Leads',
      title: 'Leads',
      x: 40,
      y: -20,
      width: 1440,
      height: 900,
    })
  })

  it('resizes a board', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Pipeline', { x: 1600, y: 0, width: 800, height: 600 }),
    )
    expect(result.pages[0]?.boards[1]).toMatchObject({ width: 800, height: 600 })
  })

  it('rounds to integers', () => {
    const result = placed(
      placeBoard(canvas(), 'sales', 'Leads', { x: 10.4, y: 10.5, width: 500.49, height: 400.5 }),
    )
    expect(result.pages[0]?.boards[0]).toMatchObject({ x: 10, y: 11, width: 500, height: 401 })
  })

  it('accepts the minimum size and rejects anything smaller', () => {
    const ok = placeBoard(canvas(), 'sales', 'Leads', { x: 0, y: 0, width: 240, height: 160 })
    expect('canvas' in ok).toBe(true)
    for (const size of [
      { width: 239, height: 160 },
      { width: 240, height: 159 },
      { width: 239.4, height: 500 },
    ]) {
      expect(placeBoard(canvas(), 'sales', 'Leads', { x: 0, y: 0, ...size })).toMatchObject({
        status: 400,
      })
    }
  })

  it('rejects numbers that are not finite', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) {
      const rect = { x: 0, y: 0, width: 500, height: 500 }
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(placeBoard(canvas(), 'sales', 'Leads', { ...rect, [key]: bad })).toMatchObject({
          status: 400,
        })
      }
    }
  })

  it('answers 404 for an unknown page or board', () => {
    const rect = { x: 0, y: 0, width: 500, height: 500 }
    expect(placeBoard(canvas(), 'nope', 'Leads', rect)).toMatchObject({ status: 404 })
    expect(placeBoard(canvas(), 'sales', 'Nope', rect)).toMatchObject({ status: 404 })
    expect(placeBoard(canvas(), 'admin', 'Pipeline', rect)).toMatchObject({ status: 404 })
  })

  it('leaves every other board, page and key untouched, in the same order', () => {
    const before = canvas()
    const result = placed(
      placeBoard(before, 'sales', 'Leads', { x: 1, y: 2, width: 300, height: 300 }),
    )
    expect(result.pages[0]?.boards[1]).toEqual(before.pages[0]?.boards[1])
    expect(result.pages[1]).toEqual(before.pages[1])
    expect(result.overrides).toEqual(before.overrides)
    expect(result.bindings).toEqual(before.bindings)
    expect(Object.keys(result)).toEqual(Object.keys(before))
    expect(Object.keys(result.pages[0]?.boards[0] ?? {})).toEqual(
      Object.keys(before.pages[0]?.boards[0] ?? {}),
    )
  })

  it('does not mutate its input', () => {
    const before = canvas()
    placeBoard(before, 'sales', 'Leads', { x: 1, y: 2, width: 300, height: 300 })
    expect(before).toEqual(canvas())
  })
})

const sectioned = (): CanvasFile => {
  const base = canvas()
  const page = base.pages[0]
  if (!page) throw new Error('no page')
  return {
    ...base,
    pages: [
      {
        ...page,
        sections: [{ id: 'a', title: 'A' }],
        boards: [
          { ...page.boards[0], section: 'a' } as (typeof page.boards)[number],
          { ...page.boards[1], section: 'a' } as (typeof page.boards)[number],
        ],
      },
      ...base.pages.slice(1),
    ],
  }
}

const edited = (result: ReturnType<typeof applyEdit>): CanvasFile => {
  if ('error' in result) throw new Error(result.error)
  return result.canvas
}

describe('applyEdit', () => {
  it('moves several boards in one edit', () => {
    const result = edited(
      applyEdit(canvas(), 'sales', {
        boards: [
          { name: 'Leads', x: 10.4, y: 20 },
          { name: 'Pipeline', x: 1700, width: 500 },
        ],
      }),
    )
    expect(result.pages[0]?.boards[0]).toMatchObject({ x: 10, y: 20, width: 1440 })
    expect(result.pages[0]?.boards[1]).toMatchObject({ x: 1700, y: 0, width: 500, height: 900 })
  })

  it('upserts sections, keeps their order and assigns a board to a new section', () => {
    const result = edited(
      applyEdit(sectioned(), 'sales', {
        sections: {
          set: [
            { id: 'a', title: 'Renamed' },
            { id: 'b', title: 'B' },
          ],
        },
        boards: [{ name: 'Leads', section: 'b' }],
      }),
    )
    expect(result.pages[0]?.sections).toEqual([
      { id: 'a', title: 'Renamed' },
      { id: 'b', title: 'B' },
    ])
    expect(result.pages[0]?.boards[0]).toMatchObject({ section: 'b' })
    expect(result.pages[0]?.boards[1]).toMatchObject({ section: 'a' })
  })

  it('removes a section and clears the section field of its boards', () => {
    const result = edited(applyEdit(sectioned(), 'sales', { sections: { remove: ['a'] } }))
    expect(result.pages[0]?.sections).toEqual([])
    for (const board of result.pages[0]?.boards ?? []) expect('section' in board).toBe(false)
  })

  it('deletes the section field with null', () => {
    const result = edited(
      applyEdit(sectioned(), 'sales', { boards: [{ name: 'Leads', section: null }] }),
    )
    expect('section' in (result.pages[0]?.boards[0] ?? {})).toBe(false)
    expect(result.pages[0]?.boards[1]).toMatchObject({ section: 'a' })
  })

  it('answers 400 for an unknown section', () => {
    expect(
      applyEdit(sectioned(), 'sales', { boards: [{ name: 'Leads', section: 'zzz' }] }),
    ).toMatchObject({ status: 400 })
    expect(
      applyEdit(sectioned(), 'sales', {
        sections: { remove: ['a'] },
        boards: [{ name: 'Leads', section: 'a' }],
      }),
    ).toMatchObject({ status: 400 })
  })

  it('answers 404 for an unknown page and names an unknown board', () => {
    expect(applyEdit(canvas(), 'nope', { boards: [] })).toMatchObject({ status: 404 })
    const result = applyEdit(canvas(), 'sales', { boards: [{ name: 'Ghost', x: 1 }] })
    expect(result).toMatchObject({ status: 404 })
    expect('error' in result && result.error).toContain('Ghost')
  })

  it('rejects a size under the minimum and a non-finite number', () => {
    expect(applyEdit(canvas(), 'sales', { boards: [{ name: 'Leads', width: 239 }] })).toMatchObject(
      { status: 400 },
    )
    expect(
      applyEdit(canvas(), 'sales', { boards: [{ name: 'Leads', y: Number.NaN }] }),
    ).toMatchObject({ status: 400 })
  })

  it('does not mutate its input and keeps untouched pages', () => {
    const before = sectioned()
    const result = edited(applyEdit(before, 'sales', { boards: [{ name: 'Leads', x: 5 }] }))
    expect(before).toEqual(sectioned())
    expect(result.pages[1]).toBe(before.pages[1])
  })
})

describe('nested sections', () => {
  const withSections = (): CanvasFile => {
    const file = canvas()
    file.pages[0]!.sections = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', parent: 'a', color: 'blue' },
      { id: 'c', title: 'C', parent: 'b' },
    ]
    return file
  }
  const edited = (file: CanvasFile, edit: Parameters<typeof applyEdit>[2]) => {
    const result = applyEdit(file, 'sales', edit)
    if ('error' in result) throw new Error(result.error)
    return result.canvas.pages[0]!.sections as Record<string, unknown>[]
  }

  it('sets a parent and a color', () => {
    const sections = edited(canvas(), {
      sections: { set: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', parent: 'a', color: 'green' }] },
    })
    expect(sections[1]).toEqual({ id: 'b', title: 'B', parent: 'a', color: 'green' })
  })

  it('clears a parent and a gray color with null', () => {
    const sections = edited(withSections(), {
      sections: { set: [{ id: 'b', title: 'B', parent: null, color: 'gray' }] },
    })
    expect(sections[1]).toEqual({ id: 'b', title: 'B' })
  })

  it('moves the children up when a section is removed', () => {
    const sections = edited(withSections(), { sections: { remove: ['b'] } })
    expect(sections).toEqual([
      { id: 'a', title: 'A' },
      { id: 'c', title: 'C', parent: 'a' },
    ])
  })

  it.each([
    ['a missing parent', { id: 'x', title: 'X', parent: 'nope' }],
    ['a cycle', { id: 'a', title: 'A', parent: 'c' }],
    ['an unknown color', { id: 'x', title: 'X', color: 'pink' as never }],
    ['a fourth level', { id: 'x', title: 'X', parent: 'c' }],
  ])('refuses %s', (_name, entry) => {
    const result = applyEdit(withSections(), 'sales', { sections: { set: [entry] } })
    expect(result).toMatchObject({ status: 400 })
  })
})
