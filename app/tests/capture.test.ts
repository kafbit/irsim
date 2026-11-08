import { describe, expect, it } from 'vitest'
import { carryCaptures, pathWithin, resolvePath, takeCaptures } from '../public/runtime/capture.js'

interface FakeNode {
  nodeType: number
  localName: string
  parentNode: FakeNode | null
  childNodes: FakeNode[]
  captured: number[]
  setPointerCapture: (id: number) => void
}

const el = (localName: string, ...children: FakeNode[]): FakeNode => {
  const node: FakeNode = {
    nodeType: 1,
    localName,
    parentNode: null,
    childNodes: children,
    captured: [],
    setPointerCapture: (id) => {
      node.captured.push(id)
    },
  }
  for (const child of children) child.parentNode = node
  return node
}

const tree = () => {
  const handle = el('span')
  const root = el('table', el('thead', el('tr', el('th', el('b'), handle))))
  const other = el('p')
  return { handle, root, other }
}

describe('pathWithin', () => {
  it('returns the top index followed by the child indexes', () => {
    const { handle, root, other } = tree()
    expect(pathWithin([other, root] as never, handle as never)).toEqual([1, 0, 0, 0, 1])
  })

  it('returns [index] for a top-level node itself', () => {
    const { root, other } = tree()
    expect(pathWithin([other, root] as never, root as never)).toEqual([1])
  })

  it('returns null for an element outside the nodes', () => {
    const { handle, other } = tree()
    expect(pathWithin([other] as never, handle as never)).toBeNull()
  })
})

describe('resolvePath', () => {
  it('finds the same position in a structurally identical tree', () => {
    const old = tree()
    const fresh = tree()
    const path = pathWithin([old.other, old.root] as never, old.handle as never) as number[]
    expect(resolvePath([fresh.other, fresh.root] as never, path)).toBe(fresh.handle)
  })

  it('returns null when the path is out of range', () => {
    const { root } = tree()
    expect(resolvePath([root] as never, [0, 0, 5])).toBeNull()
    expect(resolvePath([root] as never, [3])).toBeNull()
    expect(resolvePath([root] as never, [])).toBeNull()
  })
})

describe('takeCaptures and carryCaptures', () => {
  it('takeCaptures finds nothing when no pointer is tracked', () => {
    const { root } = tree()
    expect(takeCaptures([root] as never)).toEqual([])
  })

  it('carryCaptures captures the equivalent new element', () => {
    const fresh = tree()
    carryCaptures([{ pointerId: 7, path: [1, 0, 0, 0, 1], localName: 'span' }], [
      fresh.other,
      fresh.root,
    ] as never)
    expect(fresh.handle.captured).toEqual([7])
  })

  it('carryCaptures skips an element with a different tag', () => {
    const fresh = tree()
    carryCaptures([{ pointerId: 7, path: [1, 0, 0, 0, 1], localName: 'div' }], [
      fresh.other,
      fresh.root,
    ] as never)
    expect(fresh.handle.captured).toEqual([])
  })

  it('carryCaptures skips a path that does not resolve', () => {
    const fresh = tree()
    carryCaptures([{ pointerId: 7, path: [1, 9, 9], localName: 'span' }], [
      fresh.other,
      fresh.root,
    ] as never)
    expect(fresh.handle.captured).toEqual([])
  })

  it('carryCaptures survives a setPointerCapture that throws', () => {
    const fresh = tree()
    fresh.handle.setPointerCapture = () => {
      throw new Error('no such pointer')
    }
    expect(() =>
      carryCaptures([{ pointerId: 7, path: [1, 0, 0, 0, 1], localName: 'span' }], [
        fresh.other,
        fresh.root,
      ] as never),
    ).not.toThrow()
  })
})
