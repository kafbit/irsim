import { useState } from 'react'
import { useMountEffect } from './use-mount-effect'

export const SNAP_KEY = 'irsim.canvas.snap'
export const STEP_KEY = 'irsim.canvas.step'
export const STEPS = [0, 8, 24] as const
export type Step = (typeof STEPS)[number]
export type MovePrefs = { snap: boolean; step: Step }

const DEFAULTS: MovePrefs = { snap: true, step: 0 }

/** Reads the saved snap and step choices, with defaults when storage is missing or unreadable. */
export function readMovePrefs(): MovePrefs {
  try {
    const stored = localStorage.getItem(STEP_KEY)
    return {
      snap: localStorage.getItem(SNAP_KEY) !== 'false',
      step: stored === '8' ? 8 : stored === '24' ? 24 : 0,
    }
  } catch {
    return DEFAULTS
  }
}

/** Saves only the given keys. */
export function writeMovePrefs(patch: Partial<MovePrefs>) {
  try {
    if (patch.snap !== undefined) localStorage.setItem(SNAP_KEY, String(patch.snap))
    if (patch.step !== undefined) localStorage.setItem(STEP_KEY, String(patch.step))
  } catch {}
}

export function useMovePrefs(): [MovePrefs, (patch: Partial<MovePrefs>) => void] {
  const [prefs, setPrefs] = useState<MovePrefs>(DEFAULTS)
  useMountEffect(() => setPrefs(readMovePrefs()))
  return [
    prefs,
    (patch) => {
      setPrefs((current) => ({ ...current, ...patch }))
      writeMovePrefs(patch)
    },
  ]
}
