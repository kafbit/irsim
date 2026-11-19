'use client'

import { memo, useEffect, useRef } from 'react'
import type { Camera } from './camera'
import type { Rect } from './geometry'
import { SECTION_TONES } from './section-colors'
import type { PlacedSection } from './sections'
import { useTheme } from './use-theme'

const RADIUS = 12

export type LiveSection = { id: string; rect: Rect } | null

export class LiveSections {
  value: LiveSection = null
  private readonly listeners = new Set<() => void>()
  set(value: LiveSection) {
    this.value = value
    for (const listener of this.listeners) listener()
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

type Props = {
  camera: Camera
  sections: PlacedSection[]
  live: LiveSections
  hovered: string | null
  selected: string | null
  dropTarget: string | null
}

export const SectionPaint = memo(function SectionPaint({
  camera,
  sections,
  live,
  hovered,
  selected,
  dropTarget,
}: Props) {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const colors = useRef(new Map<string, string>())
  const input = useRef({ sections, hovered, selected, dropTarget, theme })
  input.current = { sections, hovered, selected, dropTarget, theme }
  const paint = useRef<() => void>(() => {})

  useEffect(() => {
    colors.current.clear()
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const probe = probeRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !probe || !context) return
    const resolve = (expression: string) => {
      const cached = colors.current.get(expression)
      if (cached !== undefined) return cached
      probe.style.backgroundColor = expression
      const color = getComputedStyle(probe).backgroundColor
      colors.current.set(expression, color)
      return color
    }
    const draw = () => {
      const { view, size } = camera
      if (size.width === 0 || size.height === 0) return
      const dpr = window.devicePixelRatio || 1
      const width = Math.round(size.width * dpr)
      const height = Math.round(size.height * dpr)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      } else context.clearRect(0, 0, width, height)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const now = input.current
      const moving = live.value
      for (const placed of now.sections) {
        const { section, depth } = placed
        const rect = moving?.id === section.id ? moving.rect : placed.bounds
        const x = rect.x * view.k + view.x
        const y = rect.y * view.k + view.y
        const w = rect.width * view.k
        const h = rect.height * view.k
        if (x > size.width || y > size.height || x + w < 0 || y + h < 0) continue
        const plain = placed.color === null && depth > 0
        const area = plain ? 'var(--card)' : SECTION_TONES[placed.color ?? 'gray'].area
        const dropping = now.dropTarget === section.id
        const active = dropping || now.selected === section.id || now.hovered === section.id
        const line = dropping ? 2 : 1
        const radius = Math.min(RADIUS, w / 2, h / 2)
        context.beginPath()
        context.roundRect(x, y, w, h, radius)
        context.fillStyle = resolve(area)
        context.fill()
        context.beginPath()
        context.roundRect(
          x + line / 2,
          y + line / 2,
          Math.max(0, w - line),
          Math.max(0, h - line),
          Math.max(0, radius - line / 2),
        )
        context.lineWidth = line
        context.strokeStyle = resolve(active ? 'var(--ring)' : 'var(--border-strong)')
        context.stroke()
      }
    }
    paint.current = draw
    const stopCamera = camera.subscribe(draw)
    const stopLive = live.subscribe(draw)
    return () => {
      stopCamera()
      stopLive()
      paint.current = () => {}
    }
  }, [camera, live])

  useEffect(() => {
    paint.current()
  }, [sections, hovered, selected, dropTarget, theme])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-section-paint=""
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span ref={probeRef} aria-hidden="true" className="pointer-events-none absolute hidden" />
    </>
  )
})
