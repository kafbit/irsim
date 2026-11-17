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
  it('does not re-render when the value is unchanged', () => {
    const { board, update } = make({ hot: true })
    const before = board.state
    board.setState({ hot: true })
    expect(update).not.toHaveBeenCalled()
    expect(board.state).toBe(before)
  })

  it('re-renders once and merges when a value changed', () => {
    const { board, update } = make({ hot: true, other: 1 })
    board.setState({ hot: false })
    expect(update).toHaveBeenCalledTimes(1)
    expect(board.state).toEqual({ hot: false, other: 1 })
  })

  it('re-renders when only some keys changed', () => {
    const { board, update } = make({ a: 1, b: 2 })
    board.setState({ a: 1, b: 3 })
    expect(update).toHaveBeenCalledTimes(1)
    expect(board.state).toEqual({ a: 1, b: 3 })
  })

  it('re-renders for an empty update', () => {
    const { board, update } = make({ a: 1 })
    board.setState({})
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('compares with Object.is', () => {
    const nan = make({ n: Number.NaN })
    nan.board.setState({ n: Number.NaN })
    expect(nan.update).not.toHaveBeenCalled()
    const zero = make({ n: 0 })
    zero.board.setState({ n: -0 })
    expect(zero.update).toHaveBeenCalledTimes(1)
  })
})
