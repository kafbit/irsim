export type CanvasBoard = {
  name: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

export type ManifestBoard = CanvasBoard & { hash: string; closure: string[] }

export type PageManifest = { id: string; title: string; boards: ManifestBoard[] }

export type PageSummary = { id: string; title: string; boardCount: number; boards: string[] }
