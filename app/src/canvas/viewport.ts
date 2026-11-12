import { DEVICE_PRESETS } from '../lib/view-label'
import type { CommentView } from './comments/types'
import type { Size } from './geometry'

export type DevicePresetId = (typeof DEVICE_PRESETS)[number]['id']
export type PresetId = 'fit' | 'board' | 'responsive' | DevicePresetId
export type ViewportState = { preset: PresetId; width: number; height: number }

export const MIN_SIDE = 200
export const MAX_SIDE = 20000
export const DEFAULT_RESPONSIVE: Size = { width: 720, height: 520 }

const PAD = 24

/** The scale that fits `board` in `space`, never above 1: a board larger than the window shrinks. */
export const playScale = (board: Size, space: Size): number =>
  Math.min(
    1,
    Math.max(0.05, (space.width - PAD * 2) / Math.max(board.width, 1)),
    Math.max(0.05, (space.height - PAD * 2) / Math.max(board.height, 1)),
  )

export type ZoomMode = 'normal' | 'fit-width' | 'contain'
export const ZOOM_MODES: readonly ZoomMode[] = ['normal', 'fit-width', 'contain']

export const isZoomMode = (value: unknown): value is ZoomMode =>
  typeof value === 'string' && (ZOOM_MODES as readonly string[]).includes(value)

export const readZoom = (raw: string | null): ZoomMode => (isZoomMode(raw) ? raw : 'normal')

/** The scale of the board in the stage: normal is 1, fit-width fills the width, contain shows it all. */
export const zoomScale = (mode: ZoomMode, size: Size, space: Size): number => {
  if (mode === 'normal') return 1
  if (mode === 'contain') return playScale(size, space)
  return Math.min(1, Math.max(0.05, (space.width - PAD * 2) / Math.max(size.width, 1)))
}

export const clampSide = (value: number): number =>
  Number.isNaN(value) ? MIN_SIDE : Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(value)))

const device = (id: string) => DEVICE_PRESETS.find((preset) => preset.id === id)

export const isPresetId = (id: unknown): id is PresetId =>
  id === 'fit' || id === 'board' || id === 'responsive' || (typeof id === 'string' && !!device(id))

export function presetState(id: PresetId, board: Size, current?: Size): ViewportState {
  if (id === 'fit' || id === 'board') return { preset: id, width: board.width, height: board.height }
  if (id === 'responsive') {
    const size = current ?? DEFAULT_RESPONSIVE
    return { preset: id, width: clampSide(size.width), height: clampSide(size.height) }
  }
  const found = device(id)
  return { preset: id, width: found?.width ?? board.width, height: found?.height ?? board.height }
}

export const rotate = (state: ViewportState): ViewportState =>
  state.preset === 'fit' ? state : { ...state, width: state.height, height: state.width }

export const withSize = (_state: ViewportState, width: number, height: number): ViewportState => ({
  preset: 'responsive',
  width: clampSide(width),
  height: clampSide(height),
})

export function readViewport(raw: string | null, board: Size): ViewportState {
  const fit = presetState('fit', board)
  if (!raw) return fit
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return fit
    const { preset, width, height } = value as Record<string, unknown>
    if (!isPresetId(preset)) return fit
    if (preset === 'fit' || preset === 'board') return presetState(preset, board)
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return fit
    }
    return { preset, width: clampSide(width), height: clampSide(height) }
  } catch {
    return fit
  }
}

export const writeViewport = (state: ViewportState): string =>
  JSON.stringify({ preset: state.preset, width: state.width, height: state.height })

export const scaleToFit = (state: ViewportState, space: Size): number => playScale(state, space)

export const stateFromView = (view: CommentView): ViewportState => {
  const preset = isPresetId(view.preset) && device(view.preset) ? view.preset : 'responsive'
  return { preset, width: clampSide(view.width), height: clampSide(view.height) }
}

export const viewOf = (state: ViewportState, scroll: { x: number; y: number }): CommentView => ({
  preset: state.preset,
  width: state.width,
  height: state.height,
  scrollX: scroll.x,
  scrollY: scroll.y,
})
