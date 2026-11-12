import type { Size, View } from './geometry'
import { easeInOutCubic, gridOf, LABELS_MIN_SCALE, lerpView, sameView } from './navigation'

const SETTLE_MS = 100
const COOL_MS = 150
const ANIMATION_MS = 300

export type CameraListener = (view: View, size: Size) => void

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The live camera. Pan and zoom write `view` and one DOM update per animation frame (the world
 * transform, the `--k` and `--inv` variables the frame labels read, the grid variables on the
 * viewport); React hears about the view only through `onSettle`, 100 ms after the last `move`
 * or at once after `jump` and the end of an animation.
 */
export class Camera {
  view: View = { x: 0, y: 0, k: 1 }
  size: Size = { width: 0, height: 0 }
  private viewport: HTMLElement | null = null
  private world: HTMLElement | null = null
  private readonly listeners = new Set<CameraListener>()
  private readonly onSettle: (view: View, size: Size) => void
  private frame = 0
  private flight = 0
  private destination: View | null = null
  private settleTimer = 0
  private coolTimer = 0
  private labels = true

  constructor(onSettle: (view: View, size: Size) => void) {
    this.onSettle = onSettle
  }

  setViewport(element: HTMLElement | null) {
    this.viewport = element
    this.draw()
  }

  setWorld(element: HTMLElement | null) {
    this.world = element
    this.labels = true
    this.draw()
  }

  viewportElement(): HTMLElement | null {
    return this.viewport
  }

  focusViewport() {
    this.viewport?.focus()
  }

  setCursor(cursor: string) {
    if (this.viewport) this.viewport.style.cursor = cursor
  }

  /** While true the frames ignore the pointer, so a drag over a live board keeps panning. */
  setBlocked(blocked: boolean) {
    this.world?.toggleAttribute('data-blocked', blocked)
  }

  /** Calls `listener` with every drawn view, and once now. Returns the unsubscribe function. */
  subscribe(listener: CameraListener): () => void {
    this.listeners.add(listener)
    listener(this.view, this.size)
    return () => this.listeners.delete(listener)
  }

  /** A gesture step: ends a running animation, draws on the next frame, settles after 100 ms of quiet. */
  move(next: View) {
    this.cancelFlight()
    this.view = next
    this.heat()
    this.schedule()
    window.clearTimeout(this.settleTimer)
    this.settleTimer = window.setTimeout(() => this.settle(), SETTLE_MS)
  }

  /** Puts the camera at `next` and tells React at once. */
  jump(next: View) {
    this.cancelFlight()
    this.view = next
    this.heat()
    this.draw()
    this.settle()
  }

  /** Where a running animation ends, or the current view when none runs. */
  get target(): View {
    return this.destination ?? this.view
  }

  /** Moves to `next` over 300 ms with ease-in-out cubic. Any `move`, `jump` or `stop` ends it. */
  go(next: View) {
    if (sameView(next, this.view)) return
    if (reducedMotion()) return this.jump(next)
    this.cancelFlight()
    this.destination = next
    window.clearTimeout(this.settleTimer)
    const from = this.view
    const start = performance.now()
    this.heat()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS)
      this.view = t === 1 ? next : lerpView(from, next, easeInOutCubic(t))
      this.draw()
      if (t < 1) this.flight = requestAnimationFrame(step)
      else {
        this.flight = 0
        this.destination = null
        this.settle()
      }
    }
    this.flight = requestAnimationFrame(step)
  }

  /** Ends a running animation where it is. Call it on any pointer input. */
  stop() {
    if (!this.flight) return
    this.cancelFlight()
    this.settle()
  }

  settle() {
    window.clearTimeout(this.settleTimer)
    window.clearTimeout(this.coolTimer)
    this.coolTimer = window.setTimeout(
      () => this.world?.style.removeProperty('will-change'),
      COOL_MS,
    )
    this.onSettle(this.view, this.size)
  }

  detach() {
    this.cancelFlight()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    window.clearTimeout(this.settleTimer)
    window.clearTimeout(this.coolTimer)
    this.viewport = null
    this.world = null
  }

  private cancelFlight() {
    cancelAnimationFrame(this.flight)
    this.flight = 0
    this.destination = null
  }

  private heat() {
    window.clearTimeout(this.coolTimer)
    this.world?.style.setProperty('will-change', 'transform')
  }

  private schedule() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  private draw() {
    const { x, y, k } = this.view
    if (this.world) {
      const style = this.world.style
      style.transform = `translate(${x}px, ${y}px) scale(${k})`
      style.setProperty('--k', String(k))
      style.setProperty('--inv', String(1 / k))
      const labels = k >= LABELS_MIN_SCALE
      if (labels !== this.labels) {
        this.labels = labels
        this.world.toggleAttribute('data-labels-off', !labels)
      }
    }
    if (this.viewport) {
      const grid = gridOf(this.view)
      const style = this.viewport.style
      style.setProperty('--grid-size', `${grid.size}px`)
      style.setProperty('--grid-x', `${grid.x}px`)
      style.setProperty('--grid-y', `${grid.y}px`)
      style.setProperty('--grid-alpha', String(Math.round(grid.alpha * 100)))
    }
    for (const listener of this.listeners) listener(this.view, this.size)
  }
}
