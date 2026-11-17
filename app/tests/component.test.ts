import { describe, expect, it, vi } from 'vitest'
import { DCLogic } from '../public/runtime/component.js'

const make = (state: Record<string, unknown>) => {
  const board = new DCLogic({}) as DCLogic & { __update?: () => void }
  board.state = state
  const update = vi.fn()
  board.__update = update
  return { board, update }
}

describe('DCLogic.setState', () => {
  it('re-renders once and merges when a value changed', () => {
    const { board, update } = make({ hot: true, other: 1 })
    board.setState({ hot: false })
    expect(update).toHaveBeenCalledTimes(1)
    expect(board.state).toEqual({ hot: false, other: 1 })
  })

  it('re-renders for an empty update', () => {
    const { board, update } = make({ a: 1 })
    board.setState({})
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('re-renders when an array is mutated in place and passed again', () => {
    const { board, update } = make({ items: [1] })
    ;(board.state.items as number[]).push(2)
    board.setState({ items: board.state.items })
    expect(update).toHaveBeenCalledTimes(1)
    expect(board.state.items).toEqual([1, 2])
  })
})
