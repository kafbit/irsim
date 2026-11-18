import { useState } from 'react'
import { useMountEffect } from '../use-mount-effect'

export const AUTO_SEND_KEY = 'irsim.comments.autoSend'

export function readAutoSend(): boolean {
  try {
    return localStorage.getItem(AUTO_SEND_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeAutoSend(on: boolean) {
  try {
    localStorage.setItem(AUTO_SEND_KEY, String(on))
  } catch {}
}

export function useAutoSend(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false)
  useMountEffect(() => setOn(readAutoSend()))
  return [
    on,
    (next) => {
      setOn(next)
      writeAutoSend(next)
    },
  ]
}
