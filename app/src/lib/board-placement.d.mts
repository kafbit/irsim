export type PlacementRect = { name: string; x: number; y: number; width: number; height: number }
export type Position = { x: number; y: number }
export type Size = { width: number; height: number }

export const GAP: number
export const TITLE_BAR: number
export function findOverlaps(rects: PlacementRect[], gap?: number): [string, string][]
export function placeAtEnd(
  existing: PlacementRect[],
  sizes: Size[],
  gap?: number,
  rowWidth?: number,
): Position[]
export function placeBeside(
  rects: PlacementRect[],
  anchorName: string,
  side: 'left' | 'right',
  size: Size,
  gap?: number,
): { placed: Position & Size; moved: Map<string, Position> }
export function resolveCollisions(
  rects: PlacementRect[],
  fixedNames: Iterable<string>,
  gap?: number,
): Map<string, Position>
