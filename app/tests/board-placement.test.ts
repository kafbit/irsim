import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findOverlaps,
  type PlacementRect,
  type Position,
  placeAtEnd,
  placeBeside,
  resolveCollisions,
  type Size,
} from '../src/lib/board-placement.mjs'

type Fixture = {
  description: string
  fn: 'findOverlaps' | 'placeAtEnd' | 'placeBeside' | 'resolveCollisions'
  gap: number
  rects: PlacementRect[]
  expected: unknown
  rowWidth?: number
  sizes?: Size[]
  anchor?: string
  side?: 'left' | 'right'
  size?: Size
  fixed?: string[]
}

const DIR = join(__dirname, 'fixtures/board-placement')
const fixtures = readdirSync(DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => [file, JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Fixture] as const)

const plain = (value: unknown): unknown =>
  value instanceof Map ? Object.fromEntries(value) : value

const apply = (fixture: Fixture): { result: unknown; after: PlacementRect[] } => {
  const { gap, rects } = fixture
  const snapshot = structuredClone(rects)
  if (fixture.fn === 'findOverlaps') return { result: findOverlaps(rects, gap), after: snapshot }
  if (fixture.fn === 'placeAtEnd') {
    const sizes = fixture.sizes ?? []
    const positions: Position[] = placeAtEnd(rects, sizes, gap, fixture.rowWidth)
    return {
      result: positions,
      after: [
        ...snapshot,
        ...positions.map((position, index) => ({
          name: `new${index}`,
          ...position,
          ...(sizes[index] as Size),
        })),
      ],
    }
  }
  if (fixture.fn === 'placeBeside') {
    const { placed, moved } = placeBeside(
      rects,
      fixture.anchor as string,
      fixture.side as 'left' | 'right',
      fixture.size as Size,
      gap,
    )
    return {
      result: { placed, moved: plain(moved) },
      after: [
        ...snapshot.map((rect) => ({ ...rect, ...moved.get(rect.name) })),
        { name: 'new', ...placed },
      ],
    }
  }
  const moved = resolveCollisions(rects, fixture.fixed ?? [], gap)
  return {
    result: plain(moved),
    after: snapshot.map((rect) => ({ ...rect, ...moved.get(rect.name) })),
  }
}

describe('board placement fixtures', () => {
  it('has a fixture for every scenario', () => {
    expect(fixtures.map(([file]) => file)).toEqual([
      'already-tidy.json',
      'beside-different-heights.json',
      'beside-equal-positions.json',
      'beside-left.json',
      'beside-nested-cascade.json',
      'between-fixed.json',
      'dense-row.json',
      'equal-positions.json',
      'fixed-board.json',
      'new-board-on-kept.json',
      'prefers-untouched.json',
      'push-cascade.json',
      'sections-as-one-rect.json',
      'two-rows.json',
    ])
  })

  describe.each(fixtures)('%s', (_file, fixture) => {
    it('gives the expected result', () => {
      expect(apply(fixture).result).toEqual(fixture.expected)
    })

    it('is deterministic and does not mutate its input', () => {
      const before = structuredClone(fixture.rects)
      expect(apply(fixture).result).toEqual(apply(fixture).result)
      expect(fixture.rects).toEqual(before)
    })

    it('leaves no two boards closer than the gap, except pairs the input already had', () => {
      if (fixture.fn === 'findOverlaps') return
      const earlier = new Set(findOverlaps(fixture.rects, fixture.gap).map((pair) => pair.join()))
      const added = findOverlaps(apply(fixture).after, fixture.gap).filter(
        (pair) => !earlier.has(pair.join()),
      )
      expect(added).toEqual([])
    })

    it('returns integer positions', () => {
      const text = JSON.stringify(apply(fixture).result)
      expect(text).not.toMatch(/\d\.\d/)
    })
  })
})

describe('resolveCollisions', () => {
  it('leaves boards that already overlap each other where they are when both are fixed', () => {
    const rects = [
      { name: 'a', x: 0, y: 0, width: 400, height: 300 },
      { name: 'b', x: 100, y: 100, width: 400, height: 300 },
    ]
    expect(resolveCollisions(rects, ['a', 'b'], 80).size).toBe(0)
  })

  it('moves every overlapping board in reading order without leaving a collision', () => {
    const rects = [
      { name: 'a', x: 0, y: 0, width: 400, height: 300 },
      { name: 'b', x: 50, y: 50, width: 400, height: 300 },
      { name: 'c', x: 100, y: 100, width: 400, height: 300 },
    ]
    const moved = resolveCollisions(rects, ['a'], 80)
    const next = rects.map((rect) => ({ ...rect, ...moved.get(rect.name) }))
    expect(findOverlaps(next, 80)).toEqual([])
  })
})

const random = (seed: number) => {
  let state = seed
  return (max: number) => {
    state = (state * 48271) % 2147483647
    return Math.floor((state / 2147483647) * max)
  }
}

const scatter = (seed: number, count: number): PlacementRect[] => {
  const next = random(seed)
  return Array.from({ length: count }, (_, index) => ({
    name: `b${index}`,
    x: next(40) * 60,
    y: next(25) * 60,
    width: 200 + next(5) * 100,
    height: 150 + next(5) * 100,
  }))
}

describe('findOverlaps', () => {
  it('gives the same pairs whatever the input order', () => {
    const rects = scatter(7, 20)
    const sorted = (pairs: [string, string][]) => pairs.map((pair) => [...pair].sort().join()).sort()
    expect(sorted(findOverlaps([...rects].reverse(), 80))).toEqual(sorted(findOverlaps(rects, 80)))
  })

  it('counts boards exactly the gap apart as clear and one pixel closer as too close', () => {
    const a = { name: 'a', x: 0, y: 0, width: 400, height: 300 }
    expect(findOverlaps([a, { ...a, name: 'b', x: 480 }], 80)).toEqual([])
    expect(findOverlaps([a, { ...a, name: 'b', x: 479 }], 80)).toEqual([['a', 'b']])
    expect(findOverlaps([a, { ...a, name: 'b', x: 479, y: 380 }], 80)).toEqual([])
  })
})

describe('placeBeside on scattered boards', () => {
  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))(
    'seed %i: moves along x only, away from the anchor, keeps the anchor, adds no close pair',
    (seed) => {
      const rects = scatter(seed, 18)
      const anchor = rects[seed % rects.length] as PlacementRect
      const side = seed % 2 === 0 ? 'right' : 'left'
      const { placed, moved } = placeBeside(rects, anchor.name, side, { width: 300, height: 400 }, 80)
      expect(moved.has(anchor.name)).toBe(false)
      for (const rect of rects) {
        const to = moved.get(rect.name)
        if (!to) continue
        expect(to.y).toBe(rect.y)
        expect(side === 'right' ? to.x > rect.x : to.x < rect.x).toBe(true)
      }
      const before = new Set(findOverlaps(rects, 80).map((pair) => pair.join()))
      const after = [...rects.map((rect) => ({ ...rect, ...moved.get(rect.name) })), { name: 'new', ...placed }]
      expect(findOverlaps(after, 80).filter((pair) => !before.has(pair.join()))).toEqual([])
    },
  )

  it('mirrors left and right', () => {
    const rects = scatter(3, 15)
    const flipped = rects.map((rect) => ({ ...rect, x: 0 - rect.x - rect.width }))
    const size = { width: 300, height: 400 }
    const anchor = (rects[4] as PlacementRect).name
    const toRight = placeBeside(rects, anchor, 'right', size, 80)
    const toLeft = placeBeside(flipped, anchor, 'left', size, 80)
    expect(toLeft.placed.x).toBe(0 - toRight.placed.x - size.width)
    const widths = new Map(rects.map((rect) => [rect.name, rect.width]))
    expect(Object.fromEntries(toLeft.moved)).toEqual(
      Object.fromEntries(
        [...toRight.moved].map(([name, to]) => [name, { x: 0 - to.x - (widths.get(name) ?? 0), y: to.y }]),
      ),
    )
  })
})

describe('resolveCollisions on scattered boards', () => {
  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))(
    'seed %i: leaves no close pair except between fixed boards, moves no board that was clear',
    (seed) => {
      const rects = scatter(seed, 18)
      const fixed = rects.filter((_, index) => index % 3 === 0).map((rect) => rect.name)
      const moved = resolveCollisions(rects, fixed, 80)
      const crowded = new Set(findOverlaps(rects, 80).flat())
      for (const name of moved.keys()) {
        expect(fixed).not.toContain(name)
        expect(crowded.has(name)).toBe(true)
      }
      const after = rects.map((rect) => ({ ...rect, ...moved.get(rect.name) }))
      const pinned = new Set(fixed)
      expect(
        findOverlaps(after, 80).filter(([a, b]) => !(pinned.has(a) && pinned.has(b))),
      ).toEqual([])
    },
  )
})
