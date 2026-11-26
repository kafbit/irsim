import { describe, expect, it } from 'vitest'
import {
  applyEdit,
  type CanvasFile,
  placeBoard,
  placeInSection,
  resolveLayout,
  syncFromDisk,
} from '../src/lib/canvas-layout'

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

describe('moving a board smaller than the minimum', () => {
  const small = (): CanvasFile => ({
    pages: [{ id: 'p', boards: [{ name: 'Bar', x: 0, y: 0, width: 1440, height: 48 }] }],
  })
  it('allows a move and keeps the size', () => {
    const result = applyEdit(small(), 'p', { boards: [{ name: 'Bar', x: 10, y: 20 }] })
    expect('canvas' in result && result.canvas.pages[0]?.boards[0]).toEqual({ name: 'Bar', x: 10, y: 20, width: 1440, height: 48 })
  })
  it('still refuses a resize under the minimum', () => {
    expect(applyEdit(small(), 'p', { boards: [{ name: 'Bar', height: 100 }] })).toMatchObject({ status: 400 })
  })
})

// A person's drag goes through applyEdit, and it moves exactly the boards the edit names: a frame
// dropped on top of another leaves that frame where it is. The push lives in the agent path,
// `syncFromDisk`, and in `resolveLayout`, which the page's Arrange uses.
describe('applyEdit moves only the boards the edit names', () => {
  const row = (): CanvasFile => ({
    version: 1,
    pages: [
      {
        id: 'p',
        title: 'P',
        sections: [{ id: 's', title: 'S' }],
        boards: [
          { name: 'A', x: 0, y: 0, width: 400, height: 300 },
          { name: 'B', x: 480, y: 0, width: 400, height: 300 },
          { name: 'C', x: 0, y: 380, width: 400, height: 300 },
          { name: 'M1', x: 2000, y: 0, width: 400, height: 300, section: 's' },
          { name: 'M2', x: 2480, y: 0, width: 400, height: 300, section: 's' },
          { name: 'X', x: 5000, y: 0, width: 400, height: 300 },
          { name: 'Y', x: 5100, y: 100, width: 400, height: 300 },
        ],
      },
    ],
  })
  const boardOf = (canvas: CanvasFile, name: string) =>
    canvas.pages[0]?.boards.find((entry) => entry.name === name)

  it('leaves the board the dragged one lands on exactly where it was', () => {
    const next = placed(applyEdit(row(), 'p', { boards: [{ name: 'A', x: 200, y: 0 }] }))
    expect(boardOf(next, 'A')).toMatchObject({ x: 200, y: 0 })
    expect(boardOf(next, 'B')).toMatchObject({ x: 480, y: 0 })
    expect(boardOf(next, 'C')).toMatchObject({ x: 0, y: 380 })
  })

  it('moves the stored area of a section when an edit moves all its boards by the same distance', () => {
    const canvas = row()
    canvas.pages[0]!.sections = [{ id: 's', title: 'S', x: 1960, y: -40, width: 960, height: 380 } as never]
    const next = placed(
      applyEdit(canvas, 'p', {
        boards: [
          { name: 'M1', x: 2100, y: 0 },
          { name: 'M2', x: 2580, y: 0 },
        ],
      }),
    )
    const section = (next.pages[0]?.sections as { id: string; x: number }[]).find((entry) => entry.id === 's')
    expect(section?.x).toBe(2060)
  })

  it('does not push anything when an edit only changes a section membership', () => {
    const next = placed(applyEdit(row(), 'p', { boards: [{ name: 'A', section: 's' }] }))
    expect(boardOf(next, 'B')).toMatchObject({ x: 480, y: 0 })
    expect(boardOf(next, 'M1')).toMatchObject({ x: 2000, y: 0 })
  })

  it('changes nothing else when the edit overlaps nothing', () => {
    const next = placed(applyEdit(row(), 'p', { boards: [{ name: 'A', x: 0, y: -400 }] }))
    expect(boardOf(next, 'B')).toMatchObject({ x: 480, y: 0 })
  })

  it('leaves an overlap the edit did not touch', () => {
    const next = placed(applyEdit(row(), 'p', { boards: [{ name: 'A', x: 0, y: -400 }] }))
    expect(boardOf(next, 'X')).toMatchObject({ x: 5000, y: 0 })
    expect(boardOf(next, 'Y')).toMatchObject({ x: 5100, y: 100 })
  })

  it('leaves the section a dragged board covers where it is', () => {
    const next = placed(applyEdit(row(), 'p', { boards: [{ name: 'B', x: 1900, y: 0 }] }))
    expect(boardOf(next, 'B')).toMatchObject({ x: 1900, y: 0 })
    expect(boardOf(next, 'M1')).toMatchObject({ x: 2000, y: 0 })
    expect(boardOf(next, 'M2')).toMatchObject({ x: 2480, y: 0 })
  })
})

const rect = (name: string, x: number, y: number, section?: string) => ({
  name,
  x,
  y,
  width: 300,
  height: 200,
  ...(section ? { section } : {}),
})

const filed = (boards: Record<string, unknown>[], sections: Record<string, unknown>[]): CanvasFile =>
  ({
    version: 1,
    pages: [{ id: 'p', title: 'P', sections, boards: boards.map((b) => ({ title: String(b.name), ...b })) }],
    overrides: { colors: {}, radius: {}, type: {} },
    bindings: {},
  }) as unknown as CanvasFile

const at = (file: CanvasFile, name: string) => {
  const board = file.pages[0].boards.find((entry) => entry.name === name)
  return { x: board?.x, y: board?.y }
}

describe('resolveLayout by container', () => {
  const sections = [
    { id: 'P', title: 'P' },
    { id: 'A', title: 'A', parent: 'P' },
    { id: 'B', title: 'B', parent: 'P' },
    { id: 'Q', title: 'Q' },
  ]

  it('pushes a sibling section as a block, then the neighbour of the grown parent', () => {
    const before = [rect('a1', 0, 0, 'A'), rect('a2', 0, 280, 'A'), rect('b1', 600, 0, 'B'), rect('b2', 600, 280, 'B'), rect('q1', 1200, 0, 'Q')]
    const after = before.map((board) => (board.name === 'a1' ? { ...board, width: 500 } : board))
    const moves = resolveLayout(after, sections, ['a1'], before).boards
    expect(moves.get('b1')).toEqual({ x: 708, y: 0 })
    expect(moves.get('b2')).toEqual({ x: 708, y: 280 })
    expect(moves.get('q1')).toEqual({ x: 1280, y: 0 })
    expect(moves.has('a2')).toBe(false)
  })
})

describe('placeInSection', () => {
  const sections = [
    { id: 'S', title: 'S' },
    { id: 'N', title: 'N' },
  ]

  it('goes below a row when the right side meets a neighbouring section', () => {
    const boards = [rect('m1', 0, 0, 'S'), rect('m2', 380, 0, 'S'), rect('n1', 840, 0, 'N'), rect('new', 0, 0, 'S')]
    expect(placeInSection(boards, sections, 'new')).toEqual({ x: 0, y: 280 })
  })

  it('goes right of the last member when the section is alone', () => {
    const boards = [rect('m1', 0, 0, 'S'), rect('new', 0, 0, 'S')]
    expect(placeInSection(boards, sections, 'new')).toEqual({ x: 380, y: 0 })
  })

  it('returns null without a section or without members', () => {
    expect(placeInSection([rect('new', 0, 0)], sections, 'new')).toBeNull()
    expect(placeInSection([rect('new', 0, 0, 'S')], sections, 'new')).toBeNull()
  })
})

describe('syncFromDisk', () => {
  const sections = [
    { id: 'A', title: 'A' },
    { id: 'B', title: 'B' },
  ]
  const base = [rect('a1', 0, 0, 'A'), rect('b1', 1000, 0, 'B')]

  it('returns null for an unchanged file', () => {
    expect(syncFromDisk(filed(base, sections), filed(base, sections))).toBeNull()
  })

  it('moves a new board next to its section and leaves the other section', () => {
    const next = filed([...base, rect('a2', 1100, 100, 'A')], sections)
    const out = syncFromDisk(filed(base, sections), next)
    expect(out && at(out, 'a2')).toEqual({ x: 380, y: 0 })
    expect(out && at(out, 'b1')).toEqual({ x: 1000, y: 0 })
    expect(at(next, 'a2')).toEqual({ x: 1100, y: 100 })
  })

  it('pushes the neighbour of a board an agent moved into it', () => {
    const next = filed([rect('a1', 800, 0, 'A'), base[1]], sections)
    const out = syncFromDisk(filed(base, sections), next)
    expect(out && at(out, 'b1')).toEqual({ x: 1308, y: 0 })
    expect(out && at(out, 'a1')).toEqual({ x: 800, y: 0 })
  })

  it('moves the stored area of a section with the boards the agent write pushes', () => {
    const areas = [
      { id: 'A', title: 'A' },
      { id: 'B', title: 'B', x: 960, y: -40, width: 400, height: 280 },
    ]
    const next = filed([rect('a1', 800, 0, 'A'), rect('b1', 1000, 0, 'B')], areas)
    const out = syncFromDisk(filed([rect('a1', 0, 0, 'A'), rect('b1', 1000, 0, 'B')], areas), next)
    const pushed = out && at(out, 'b1')
    const area = ((out?.pages[0]?.sections ?? []) as { id: string; x: number; y: number }[]).find(
      (entry) => entry.id === 'B',
    )
    expect(pushed).toEqual({ x: 1308, y: 0 })
    expect(area).toMatchObject({ x: 960 + 308, y: -40 })
  })

  it('places a new board with a section and no position beside its section', () => {
    const { x: _x, y: _y, ...bare } = rect('a2', 0, 0, 'A')
    const out = syncFromDisk(filed(base, sections), filed([...base, bare], sections))
    expect(out && at(out, 'a2')).toEqual({ x: 380, y: 0 })
  })

  it('moves a new board with no section off the boards it covers and pushes nothing', () => {
    const out = syncFromDisk(filed(base, sections), filed([...base, rect('c1', 50, 50)], sections))
    expect(out && at(out, 'c1')).not.toEqual({ x: 50, y: 50 })
    expect(out && at(out, 'a1')).toEqual({ x: 0, y: 0 })
    expect(out && at(out, 'b1')).toEqual({ x: 1000, y: 0 })
  })

  it('fills a nested section below its row and pushes the sibling section, not the top level neighbour', () => {
    const nested = [
      { id: 'I', title: 'I' },
      { id: 'S', title: 'S', parent: 'I' },
      { id: 'V', title: 'V', parent: 'I' },
      { id: 'C', title: 'C' },
    ]
    const wide = (name: string, x: number, y: number, section: string) => ({ ...rect(name, x, y, section), width: 400, height: 300 })
    const start = [wide('s1', 0, 0, 'S'), wide('s2', 480, 0, 'S'), wide('v1', 0, 700, 'V'), wide('v2', 480, 700, 'V'), wide('c1', 1400, 0, 'C'), wide('c3', 1400, 460, 'C')]
    const out = syncFromDisk(filed(start, nested), filed([...start, wide('g', 1450, 800, 'S'), wide('w', 1000, 300, 'S')], nested))
    expect(out && at(out, 'g')).toEqual({ x: 0, y: 380 })
    expect(out && at(out, 'w')).toEqual({ x: 480, y: 380 })
    expect(out && at(out, 'v1')).toEqual({ x: 0, y: 936 })
    expect(out && at(out, 'c1')).toEqual({ x: 1400, y: 0 })
  })

  it('leaves four boards an agent moved into a new section as a row 40 px apart', () => {
    const loose = [rect('r1', 0, 0), rect('r2', 400, 0), rect('r3', 800, 0), rect('r4', 1200, 0), rect('z', 0, 2000)]
    const row = [rect('r1', 0, 600, 'N'), rect('r2', 340, 600, 'N'), rect('r3', 680, 600, 'N'), rect('r4', 1020, 600, 'N'), rect('z', 0, 2000)]
    const out = syncFromDisk(filed(loose, []), filed(row, [{ id: 'N', title: 'N' }]))
    for (const board of row) expect(out ? at(out, board.name) : { x: board.x, y: board.y }).toEqual({ x: board.x, y: board.y })
  })

  it('leaves a renamed loose board 40 px from another where it is', () => {
    const before = [rect('l1', 0, 0), rect('l2', 340, 0)]
    const after = [rect('l1', 0, 0), rect('l3', 340, 0)]
    const out = syncFromDisk(filed(before, []), filed(after, []))
    expect(out).toBeNull()
  })

  it('leaves a renamed board inside a section where it is', () => {
    const before = [rect('s1', 0, 0, 'A'), rect('s2', 340, 0, 'A')]
    const after = [rect('s1', 0, 0, 'A'), rect('s3', 340, 0, 'A')]
    const out = syncFromDisk(filed(before, sections), filed(after, sections))
    expect(out).toBeNull()
  })

  it('separates a section whose new parent puts its area over a sibling', () => {
    const tree = [
      { id: 'A', title: 'A' },
      { id: 'C', title: 'C' },
    ]
    const boards = [rect('a1', 0, 0, 'A'), rect('a2', 320, 0, 'A'), rect('c1', 640, 0, 'C')]
    const out = syncFromDisk(filed(boards, tree), filed(boards, [tree[0], { ...tree[1], parent: 'A' }]))
    expect(out).not.toBeNull()
    if (!out) return
    const a2 = at(out, 'a2') as { x: number; y: number }
    const c1 = at(out, 'c1') as { x: number; y: number }
    const apart =
      a2.x + 300 <= c1.x - 64 || c1.x + 300 + 64 <= a2.x || a2.y + 200 <= c1.y - 24 - 64 || c1.y + 200 + 64 <= a2.y - 24
    expect(apart).toBe(true)
  })

  it('places a new board with no section and no position below everything', () => {
    const { x: _x, y: _y, ...bare } = rect('c1', 0, 0)
    const out = syncFromDisk(filed(base, sections), filed([...base, bare], sections))
    expect(out && at(out, 'c1')).toEqual({ x: 0, y: 280 })
  })
  describe('defects', () => {
    const box = (name: string, x: number, y: number, width: number, height: number, section?: string) => ({
      name,
      x,
      y,
      width,
      height,
      ...(section ? { section } : {}),
    })
    const drawn = (file: CanvasFile, name: string) => {
      const board = file.pages[0].boards.find((entry) => entry.name === name) as unknown as {
        x: number
        y: number
        width: number
        height: number
      }
      return { x: board.x, y: board.y - 24, width: board.width, height: board.height + 24 }
    }
    const meets = (a: ReturnType<typeof drawn>, b: ReturnType<typeof drawn>) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

    it('places a new board where its drawn rect overlaps no board of a sibling sub-section', () => {
      const tree = [
        { id: 'R', title: 'R' },
        { id: 'A', title: 'A', parent: 'R' },
        { id: 'B', title: 'B', parent: 'R' },
      ]
      const boards = [box('a1', 0, 0, 300, 300, 'A'), box('a2', 380, 0, 300, 800, 'A'), box('b1', 0, 400, 300, 300, 'B')]
      const out = syncFromDisk(filed(boards, tree), filed([...boards, box('n', 380, 0, 300, 300, 'A')], tree))
      expect(out).not.toBeNull()
      if (!out) return
      const mine = drawn(out, 'n')
      for (const other of ['a1', 'a2', 'b1']) expect(meets(mine, drawn(out, other))).toBe(false)
    })

    it('does not push a top-level section that was close by design when boards are regrouped', () => {
      const prevSections = [
        { id: 'P', title: 'P' },
        { id: 'Y', title: 'Y' },
      ]
      const nextSections = [...prevSections, { id: 'S', title: 'S', parent: 'P' }]
      const prevBoards = [
        box('p1', 0, 0, 300, 300, 'P'),
        box('p2', 340, 0, 300, 300, 'P'),
        box('p3', 0, 360, 300, 300, 'P'),
        box('y1', 808, 0, 300, 300, 'Y'),
      ]
      const nextBoards = prevBoards.map((b) => (b.name === 'p1' || b.name === 'p2' ? { ...b, section: 'S' } : b))
      const out = syncFromDisk(filed(prevBoards, prevSections), filed(nextBoards, nextSections))
      expect(out === null ? { x: 808, y: 0 } : at(out, 'y1')).toEqual({ x: 808, y: 0 })
    })

    it('keeps an area the agent moved with its boards when the sync pushes other boards', () => {
      const area = { id: 'S', title: 'S', x: -100, y: -100, width: 1000, height: 600 }
      const prevBoards = [
        box('s1', 0, 0, 300, 300, 'S'),
        box('s2', 380, 0, 300, 300, 'S'),
        box('o1', 5000, 0, 300, 300),
        box('o2', 6000, 0, 300, 300),
      ]
      const nextBoards = prevBoards.map((b) =>
        b.section === 'S' ? { ...b, x: b.x + 2000 } : b.name === 'o2' ? { ...b, x: 5100 } : b,
      )
      const out = syncFromDisk(filed(prevBoards, [area]), filed(nextBoards, [{ ...area, x: 1900 }]))
      expect(out).not.toBeNull()
      expect((out?.pages[0].sections?.[0] as { x: number }).x).toBe(1900)
    })
  })
})
