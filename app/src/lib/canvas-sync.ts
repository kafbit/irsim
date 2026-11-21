import { canvasSnapshot, invalid, locked, readCanvas, setCanvasSnapshot, writeCanvas } from './canvas-file'
import { type CanvasFile, syncFromDisk } from './canvas-layout'
import { subscribe } from './events'

const readValid = async (): Promise<CanvasFile | null> => {
  try {
    const file = await readCanvas()
    return file === null || invalid(file) ? null : (file as CanvasFile)
  } catch {
    return null
  }
}

/** Starts, once per process, the sync that lays out boards an agent wrote to `canvas.json`. */
export const startCanvasSync = (): void => {
  const holder = globalThis as unknown as { __irsimCanvasSync?: boolean }
  if (holder.__irsimCanvasSync) return
  holder.__irsimCanvasSync = true
  void locked(async () => {
    if (canvasSnapshot()) return
    const file = await readValid()
    if (file) setCanvasSnapshot(file)
  }).catch(() => undefined)
  subscribe((event) => {
    if (event.event !== 'canvas') return
    void locked(async () => {
      const file = await readValid()
      if (!file) return
      const prev = canvasSnapshot()
      if (!prev) return setCanvasSnapshot(file)
      const next = syncFromDisk(prev, file)
      if (!next) return setCanvasSnapshot(file)
      const reread = await readValid()
      if (!reread || JSON.stringify(reread) !== JSON.stringify(file)) return
      await writeCanvas(next)
    }).catch(() => undefined)
  })
}
