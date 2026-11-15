import { describe, expect, it } from 'vitest'
import { rank, score } from '../src/lib/search-match'

describe('score', () => {
  it('ranks prefix above word-start above middle', () => {
    const prefix = score('sec', 'Section hover') as number
    const wordStart = score('sec', 'Canvas section') as number
    const middle = score('sec', 'Intersect') as number
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(middle)
  })

  it('prefers the shorter text when the position is equal', () => {
    expect(score('sec', 'Section') as number).toBeGreaterThan(score('sec', 'Section hover') as number)
  })

  it('matches camelCase parts', () => {
    expect(score('insvar', 'CanvasInspectorVariants')).not.toBeNull()
  })

  it('is case-insensitive', () => {
    expect(score('CANVAS', 'canvas app')).not.toBeNull()
  })

  it('returns null when the query is not a subsequence', () => {
    expect(score('zzq', 'CanvasApp')).toBeNull()
    expect(score('pac', 'cap')).toBeNull()
  })
})

describe('rank', () => {
  it('drops non-matches and sorts by the best field', () => {
    const items = [
      { name: 'CanvasSection', title: 'Canvas section' },
      { name: 'SectionHover', title: 'Hover' },
      { name: 'Toolbar', title: 'Tool bar' },
    ]
    const ranked = rank(items, 'sec', (item) => [item.name, item.title])
    expect(ranked.map((item) => item.name)).toEqual(['SectionHover', 'CanvasSection'])
  })
})
