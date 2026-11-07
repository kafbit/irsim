import type { Camera } from '../camera'
import { wheelView } from '../wheel'

const FORWARDED_KEYS = new Set([' ', 'c', 'v', 'h'])
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/**
 * A live frame in comment mode takes the pointer, so the wheel, a middle-button drag and the tool
 * keys would never reach the canvas. This hands them to the camera and the window shortcuts.
 * Pointerdown and mousedown are captured because the frame's picker stops them at the document.
 */
export function attachFrameInput(win: Window, camera: Camera, viewport: HTMLElement): () => void {
  const doc = win.document
  const frame = win.frameElement
  if (!frame) return () => {}

  const screenPoint = (event: MouseEvent) => {
    const box = frame.getBoundingClientRect()
    const area = viewport.getBoundingClientRect()
    return {
      x: box.left + event.clientX * camera.view.k - area.left,
      y: box.top + event.clientY * camera.view.k - area.top,
    }
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const { x, y } = screenPoint(event)
    camera.move(wheelView(camera.view, event, x, y))
  }

  let drag: { sx: number; sy: number; vx: number; vy: number } | null = null
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 1) return
    event.preventDefault()
    camera.stop()
    drag = { sx: event.screenX, sy: event.screenY, vx: camera.view.x, vy: camera.view.y }
    ;(event.target as Element).setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return
    camera.move({
      ...camera.view,
      x: drag.vx + event.screenX - drag.sx,
      y: drag.vy + event.screenY - drag.sy,
    })
  }
  const onPointerUp = () => {
    if (!drag) return
    drag = null
    camera.settle()
  }

  const onMouseDown = (event: MouseEvent) => event.button === 1 && event.preventDefault()

  const forward = (event: KeyboardEvent) => {
    if (!FORWARDED_KEYS.has(event.key.toLowerCase())) return
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return
    event.preventDefault()
    window.dispatchEvent(
      new KeyboardEvent(event.type, {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
      }),
    )
  }

  doc.addEventListener('wheel', onWheel, { passive: false })
  doc.addEventListener('mousedown', onMouseDown, true)
  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('pointermove', onPointerMove)
  doc.addEventListener('pointerup', onPointerUp)
  doc.addEventListener('pointercancel', onPointerUp)
  doc.addEventListener('keydown', forward)
  doc.addEventListener('keyup', forward)
  return () => {
    doc.removeEventListener('wheel', onWheel)
    doc.removeEventListener('mousedown', onMouseDown, true)
    doc.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('pointermove', onPointerMove)
    doc.removeEventListener('pointerup', onPointerUp)
    doc.removeEventListener('pointercancel', onPointerUp)
    doc.removeEventListener('keydown', forward)
    doc.removeEventListener('keyup', forward)
  }
}
