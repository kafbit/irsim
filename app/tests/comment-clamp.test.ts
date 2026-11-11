import { describe, expect, it } from 'vitest'
import { groupComments, isClamped, resolvedHeading } from '../src/canvas/comments/model'
import type { Comment } from '../src/canvas/comments/types'

const comment = (id: string, status: Comment['status']): Comment =>
  ({ id, status }) as Comment

describe('isClamped', () => {
  it('is false when the text fits', () => {
    expect(isClamped(80, 80)).toBe(false)
  })

  it('ignores a one pixel rounding difference', () => {
    expect(isClamped(81, 80)).toBe(false)
  })

  it('is true when the content is taller than the box', () => {
    expect(isClamped(160, 80)).toBe(true)
  })
})

describe('resolved comments accordion', () => {
  it('takes resolved comments out of the draft and sent lists, in order', () => {
    const groups = groupComments([
      comment('a', 'resolved'),
      comment('b', 'draft'),
      comment('c', 'queued'),
      comment('d', 'resolved'),
      comment('e', 'delivered'),
    ])
    expect(groups.draft.map((item) => item.id)).toEqual(['b'])
    expect(groups.sent.map((item) => item.id)).toEqual(['c', 'e'])
    expect(groups.resolved.map((item) => item.id)).toEqual(['a', 'd'])
  })

  it('has no heading when nothing is resolved', () => {
    expect(resolvedHeading(0)).toBeNull()
  })

  it('shows the count in the heading', () => {
    expect(resolvedHeading(3)).toBe('Resolved (3)')
    expect(resolvedHeading(1200)).toBe('Resolved (1,200)')
  })
})
