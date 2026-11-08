import { type EffectCallback, useEffect } from 'react'

/** The one place a bare mount-only `useEffect(fn, [])` belongs (AGENTS.md section 8). */
export function useMountEffect(effect: EffectCallback) {
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [])
}
