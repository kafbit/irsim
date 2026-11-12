import { describe, expect, it } from 'vitest'
import {
  clampSide,
  MAX_SIDE,
  MIN_SIDE,
  playScale,
  presetState,
  readViewport,
  rotate,
  scaleToFit,
  stateFromView,
  viewOf,
  readZoom,
  withSize,
  writeViewport,
  zoomScale,
} from '../src/canvas/viewport'

const board = { width: 960, height: 600 }

describe('clampSide', () => {
  it('rounds and clamps to the allowed range', () => {
    expect(clampSide(390.6)).toBe(391)
    expect(clampSide(10)).toBe(MIN_SIDE)
    expect(clampSide(99999)).toBe(MAX_SIDE)
    expect(clampSide(Number.NaN)).toBe(MIN_SIDE)
  })
})

describe('presetState', () => {
  it('uses the board size for fit and board', () => {
    expect(presetState('fit', board)).toEqual({ preset: 'fit', ...board })
    expect(presetState('board', board)).toEqual({ preset: 'board', ...board })
  })

  it('uses the device size for a device', () => {
    expect(presetState('phone', board)).toEqual({ preset: 'phone', width: 390, height: 844 })
    expect(presetState('desktop', board)).toEqual({ preset: 'desktop', width: 1440, height: 900 })
  })

  it('keeps the current size for responsive, or 720 by 520', () => {
    expect(presetState('responsive', board)).toEqual({
      preset: 'responsive',
      width: 720,
      height: 520,
    })
    expect(presetState('responsive', board, { width: 500, height: 640 })).toEqual({
      preset: 'responsive',
      width: 500,
      height: 640,
    })
  })
})

describe('rotate', () => {
  it('swaps width and height', () => {
    expect(rotate(presetState('phone', board))).toEqual({
      preset: 'phone',
      width: 844,
      height: 390,
    })
  })

  it('does nothing on fit', () => {
    const fit = presetState('fit', board)
    expect(rotate(fit)).toEqual(fit)
  })
})

describe('withSize', () => {
  it('turns any preset into responsive with clamped sides', () => {
    expect(withSize(presetState('phone', board), 100, 9000)).toEqual({
      preset: 'responsive',
      width: MIN_SIDE,
      height: MAX_SIDE,
    })
  })
})

describe('readViewport and writeViewport', () => {
  it('round trips a device state', () => {
    const state = rotate(presetState('tablet', board))
    expect(readViewport(writeViewport(state), board)).toEqual(state)
  })

  it('round trips responsive', () => {
    const state = withSize(presetState('fit', board), 555, 777)
    expect(readViewport(writeViewport(state), board)).toEqual(state)
  })

  it('takes the current board size for fit and board', () => {
    const stored = JSON.stringify({ preset: 'board', width: 1, height: 1 })
    expect(readViewport(stored, board)).toEqual({ preset: 'board', ...board })
  })

  it('falls back to fit for missing, malformed or unknown input', () => {
    const fit = { preset: 'fit', ...board }
    expect(readViewport(null, board)).toEqual(fit)
    expect(readViewport('not json', board)).toEqual(fit)
    expect(readViewport('null', board)).toEqual(fit)
    expect(readViewport('{"preset":"watch","width":300,"height":300}', board)).toEqual(fit)
    expect(readViewport('{"preset":"phone","width":"x","height":300}', board)).toEqual(fit)
    expect(readViewport('{"preset":"phone"}', board)).toEqual(fit)
  })

  it('clamps stored sides', () => {
    expect(readViewport('{"preset":"responsive","width":10,"height":99999}', board)).toEqual({
      preset: 'responsive',
      width: MIN_SIDE,
      height: MAX_SIDE,
    })
  })
})

describe('scaleToFit', () => {
  it('never grows and shrinks to the space minus the padding', () => {
    const space = { width: 1600, height: 1000 }
    expect(scaleToFit(presetState('phone', board), space)).toBe(1)
    expect(scaleToFit(presetState('desktop', board), { width: 768, height: 1000 })).toBeCloseTo(
      720 / 1440,
    )
    expect(scaleToFit(presetState('tablet', board), { width: 1600, height: 548 })).toBeCloseTo(
      500 / 1024,
    )
  })

  it('never goes below 0.05', () => {
    expect(scaleToFit(presetState('desktop', board), { width: 10, height: 10 })).toBe(0.05)
  })

  it('agrees with playScale', () => {
    const space = { width: 900, height: 700 }
    expect(scaleToFit(presetState('laptop', board), space)).toBe(
      playScale({ width: 1280, height: 800 }, space),
    )
  })
})

describe('viewOf and stateFromView', () => {
  it('describes the viewport for a new comment', () => {
    expect(viewOf(presetState('phone', board), { x: 0, y: 320 })).toEqual({
      preset: 'phone',
      width: 390,
      height: 844,
      scrollX: 0,
      scrollY: 320,
    })
  })

  it('restores a device preset and turns any other preset into responsive', () => {
    const view = { preset: 'tablet', width: 1024, height: 768, scrollX: 0, scrollY: 0 }
    expect(stateFromView(view)).toEqual({ preset: 'tablet', width: 1024, height: 768 })
    expect(stateFromView({ ...view, preset: 'fit', width: 960, height: 600 })).toEqual({
      preset: 'responsive',
      width: 960,
      height: 600,
    })
    expect(stateFromView({ ...view, preset: 'whatever' }).preset).toBe('responsive')
  })
})

describe('readZoom', () => {
  it('defaults to normal for nothing or garbage', () => {
    expect(readZoom(null)).toBe('normal')
    expect(readZoom('')).toBe('normal')
    expect(readZoom('huge')).toBe('normal')
  })

  it('accepts the three modes', () => {
    expect(readZoom('normal')).toBe('normal')
    expect(readZoom('fit-width')).toBe('fit-width')
    expect(readZoom('contain')).toBe('contain')
  })
})

describe('zoomScale', () => {
  const space = { width: 1440, height: 852 }

  it('keeps normal at 1 even for a tall board', () => {
    expect(zoomScale('normal', { width: 390, height: 5200 }, space)).toBe(1)
  })

  it('fits the width for fit-width', () => {
    expect(
      zoomScale('fit-width', { width: 1280, height: 800 }, { width: 1000, height: 600 }),
    ).toBeCloseTo((1000 - 48) / 1280)
  })

  it('never scales fit-width above 1', () => {
    expect(zoomScale('fit-width', { width: 390, height: 844 }, space)).toBe(1)
  })

  it('equals playScale for contain', () => {
    const size = { width: 390, height: 5200 }
    expect(zoomScale('contain', size, space)).toBe(playScale(size, space))
  })
})
