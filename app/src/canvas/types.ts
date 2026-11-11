export type CanvasBoard = {
  name: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * `interactive`: the board works when played, so it gets a Play button. `fill`: the board is a web
 * page, so full screen play gives it the whole window.
 */
export type ManifestBoard = CanvasBoard & {
  hash: string
  closure: string[]
  interactive: boolean
  fill: boolean
}

export type PageManifest = { id: string; title: string; boards: ManifestBoard[] }

export type PageSummary = { id: string; title: string; boardCount: number; boards: string[] }
