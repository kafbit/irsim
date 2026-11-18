export type TidyMode = 'row' | 'column' | 'wrap' | 'grid'

export type TidyFrame = { name: string; x: number; y: number; width: number; height: number }

export type TidyOptions = {
  mode: TidyMode
  gap: number
  width?: number
  columns?: number
  rows?: number
}

const ROW_TOLERANCE = 16

const readingOrder = (frames: TidyFrame[]): TidyFrame[] => {
  const byTop = [...frames].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: TidyFrame[][] = []
  let lineTop = 0
  for (const frame of byTop) {
    const line = lines[lines.length - 1]
    if (line && frame.y - lineTop <= ROW_TOLERANCE) line.push(frame)
    else {
      lines.push([frame])
      lineTop = frame.y
    }
  }
  return lines.flatMap((line) => line.sort((a, b) => a.x - b.x))
}

const flow = (
  ordered: TidyFrame[],
  origin: { x: number; y: number },
  gap: number,
  limit: number,
): Map<string, { x: number; y: number }> => {
  const result = new Map<string, { x: number; y: number }>()
  let x = origin.x
  let y = origin.y
  let lineHeight = 0
  let count = 0
  for (const frame of ordered) {
    if (count > 0 && x + frame.width > origin.x + limit) {
      y += lineHeight + gap
      x = origin.x
      lineHeight = 0
      count = 0
    }
    result.set(frame.name, { x: Math.round(x), y: Math.round(y) })
    x += frame.width + gap
    lineHeight = Math.max(lineHeight, frame.height)
    count += 1
  }
  return result
}

const grid = (
  ordered: TidyFrame[],
  origin: { x: number; y: number },
  gap: number,
  requested: number | undefined,
): Map<string, { x: number; y: number }> => {
  const columns = Math.max(
    1,
    Math.floor(requested ?? Math.ceil(Math.sqrt(ordered.length))) || 1,
  )
  const widths: number[] = Array.from({ length: columns }, () => 0)
  const rowCount = Math.ceil(ordered.length / columns)
  const heights: number[] = Array.from({ length: rowCount }, () => 0)
  ordered.forEach((frame, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    widths[column] = Math.max(widths[column] ?? 0, frame.width)
    heights[row] = Math.max(heights[row] ?? 0, frame.height)
  })
  const result = new Map<string, { x: number; y: number }>()
  ordered.forEach((frame, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = origin.x + widths.slice(0, column).reduce((sum, value) => sum + value + gap, 0)
    const y = origin.y + heights.slice(0, row).reduce((sum, value) => sum + value + gap, 0)
    result.set(frame.name, { x: Math.round(x), y: Math.round(y) })
  })
  return result
}

/** The new top left of every frame, in reading order of the current positions, with `gap` between frames. */
export const tidy = (
  frames: TidyFrame[],
  origin: { x: number; y: number },
  options: TidyOptions,
): Map<string, { x: number; y: number }> => {
  const ordered = readingOrder(frames)
  const { mode, gap } = options
  if (mode === 'row') return flow(ordered, origin, gap, Number.POSITIVE_INFINITY)
  if (mode === 'wrap') return flow(ordered, origin, gap, options.width ?? 0)
  if (mode === 'grid') return grid(ordered, origin, gap, options.columns)
  const result = new Map<string, { x: number; y: number }>()
  let y = origin.y
  for (const frame of ordered) {
    result.set(frame.name, { x: Math.round(origin.x), y: Math.round(y) })
    y += frame.height + gap
  }
  return result
}
