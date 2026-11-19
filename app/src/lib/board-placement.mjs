export const GAP = 80
export const TITLE_BAR = 48
const ROW_WIDTH = 12000

const right = (rect) => rect.x + rect.width
const bottom = (rect) => rect.y + rect.height
const gapX = (a, b) => Math.max(a.x, b.x) - Math.min(right(a), right(b))
const gapY = (a, b) => Math.max(a.y, b.y) - Math.min(bottom(a), bottom(b))
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/**
 * True when the boards are closer than `gap` on both axes, measured from the frame to the frame.
 * The title bar above a frame is `TITLE_BAR` high, less than `GAP`, so it sits inside the gap.
 */
const near = (a, b, gap) => gapX(a, b) < gap && gapY(a, b) < gap

/** The name pairs of `rects` that are closer than `gap`, in input order. */
export function findOverlaps(rects, gap = GAP) {
  const pairs = []
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (near(rects[i], rects[j], gap)) pairs.push([rects[i].name, rects[j].name])
    }
  }
  return pairs
}

/** Positions for `sizes`, below every `existing` rect, left aligned, wrapping at `rowWidth`. */
export function placeAtEnd(existing, sizes, gap = GAP, rowWidth = ROW_WIDTH) {
  const left = existing.length > 0 ? Math.min(...existing.map((rect) => rect.x)) : 0
  let rowY = existing.length > 0 ? Math.max(...existing.map(bottom)) + gap : 0
  let cursorX = left
  let rowHeight = 0
  return sizes.map((size) => {
    if (cursorX > left && cursorX - left + size.width > rowWidth) {
      rowY += rowHeight + gap
      cursorX = left
      rowHeight = 0
    }
    const position = { x: Math.round(cursorX), y: Math.round(rowY) }
    cursorX += size.width + gap
    rowHeight = Math.max(rowHeight, size.height)
    return position
  })
}

const mirror = (rect) => ({ ...rect, x: 0 - rect.x - rect.width })

/**
 * Puts a rect of `size` left or right of `anchorName`, level with it, and shifts boards along x
 * only, in the insert direction, by the least distance that keeps every pair at least `gap` apart.
 *
 * A board moves when it is closer than `gap` to the new rect, or when a board it was at least `gap`
 * behind on x, and closer than `gap` to on y, moves into that gap. Such pairs only point forward
 * along x, so the pushes form an acyclic graph: one pass in x order gives every board its least
 * position, and nothing else moves. The anchor never moves: every pushed board ends past the new
 * rect, and the anchor is behind it. Pairs that were already closer than `gap` before the insert
 * keep their offset. Boards that are `gap` or more away on y from every pushed board stay.
 */
export function placeBeside(rects, anchorName, side, size, gap = GAP) {
  const anchor = rects.find((rect) => rect.name === anchorName)
  if (!anchor) throw new Error(`no board named ${anchorName}`)
  const flip = side === 'left'
  const view = (rect) => (flip ? mirror(rect) : rect)
  const anchorView = view(anchor)
  const placedView = {
    name: anchorName,
    x: Math.ceil(right(anchorView) + gap),
    y: Math.round(anchor.y),
    width: size.width,
    height: size.height,
  }
  const boards = rects
    .filter((rect) => rect.name !== anchorName)
    .map(view)
    .sort((a, b) => a.x - b.x || byName(a, b))
  const at = new Map()
  for (const board of boards) {
    let x = board.x
    if (near(board, placedView, gap)) x = Math.max(x, Math.ceil(right(placedView) + gap))
    for (const [name, pusherX] of at) {
      const pusher = boards.find((candidate) => candidate.name === name)
      if (pusher.x >= board.x || gapY(pusher, board) >= gap || gapX(pusher, board) < gap) continue
      x = Math.max(x, Math.ceil(pusherX + pusher.width + gap))
    }
    if (x !== board.x) at.set(board.name, x)
  }
  const moved = new Map()
  for (const board of boards) {
    if (!at.has(board.name)) continue
    const x = at.get(board.name)
    moved.set(board.name, { x: flip ? 0 - x - board.width : x, y: board.y })
  }
  const placed = flip ? mirror(placedView) : placedView
  return { placed: { x: placed.x, y: placed.y, width: size.width, height: size.height }, moved }
}

/**
 * The position nearest to `rect` along one axis at which it is at least `gap` from every rect of
 * `obstacles`. Along x, only obstacles closer than `gap` on y block, each over an open interval of
 * x, so the nearest free x is `rect.x` or an end of one of those intervals; the same holds for y.
 * Ties go to x before y, then to the positive direction. A free spot always exists: past the last
 * obstacle on either axis.
 */
const nearestFree = (rect, obstacles, gap) => {
  const candidates = []
  for (const other of obstacles) {
    if (gapY(rect, other) < gap) {
      candidates.push({ axis: 0, x: Math.ceil(right(other) + gap), y: rect.y })
      candidates.push({ axis: 0, x: Math.floor(other.x - gap - rect.width), y: rect.y })
    }
    if (gapX(rect, other) < gap) {
      candidates.push({ axis: 1, x: rect.x, y: Math.ceil(bottom(other) + gap) })
      candidates.push({ axis: 1, x: rect.x, y: Math.floor(other.y - gap - rect.height) })
    }
  }
  const cost = (spot) => Math.abs(spot.x - rect.x) + Math.abs(spot.y - rect.y)
  const forward = (spot) => (spot.x > rect.x || spot.y > rect.y ? 0 : 1)
  candidates.sort((a, b) => cost(a) - cost(b) || a.axis - b.axis || forward(a) - forward(b))
  for (const spot of candidates) {
    const moved = { ...rect, x: spot.x, y: spot.y }
    if (!obstacles.some((other) => near(moved, other, gap))) return spot
  }
  return { x: rect.x, y: rect.y }
}

/**
 * Moves the rects not in `fixedNames` that are closer than `gap` to another rect, so that none is
 * closer than `gap` to any rect, and returns a Map of the names that moved to their new x and y.
 *
 * Fixed rects stay, and so do rects that are not closer than `gap` to any other: both are obstacles.
 * The others go in reading order (top, then left, then name). Each stays when it is clear of the
 * obstacles, else it moves along one axis to the nearest free spot, and then counts as an obstacle
 * for the ones after it. Each search is over a finite candidate list, so the function ends without
 * a step cap. Pairs of fixed rects that were already too close stay as they are.
 */
export function resolveCollisions(rects, fixedNames, gap = GAP) {
  const fixed = new Set(fixedNames)
  const crowded = new Set(findOverlaps(rects, gap).flat())
  const obstacles = rects
    .filter((rect) => fixed.has(rect.name) || !crowded.has(rect.name))
    .map((rect) => ({ ...rect }))
  const loose = rects
    .filter((rect) => !fixed.has(rect.name) && crowded.has(rect.name))
    .sort((a, b) => a.y - b.y || a.x - b.x || byName(a, b))
  const moved = new Map()
  for (const original of loose) {
    const clear = !obstacles.some((other) => near(original, other, gap))
    const spot = clear ? original : nearestFree(original, obstacles, gap)
    const rect = { ...original, x: spot.x, y: spot.y }
    obstacles.push(rect)
    if (rect.x !== original.x || rect.y !== original.y) moved.set(rect.name, { x: rect.x, y: rect.y })
  }
  return moved
}
