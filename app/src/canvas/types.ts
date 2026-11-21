export type CanvasBoard = {
  name: string
  title: string
  x: number
  y: number
  width: number
  height: number
  section?: string | undefined
  variantOf?: string
  variantLabel?: string
  baseHash?: string
}

export type CanvasSection = {
  id: string
  title: string
  variantOf?: string
  parent?: string
  color?: 'gray' | 'blue' | 'green' | 'amber' | 'purple' | 'red'
  /** A stored area; a section without one fits its boards. */
  x?: number
  y?: number
  width?: number
  height?: number
  layout?: { mode: 'wrap'; gap: number }
}

/**
 * `interactive`: the board works when played, so it gets a Play button. `fill`: the board is a web
 * page, so full screen play gives it the whole window.
 */
export type ManifestBoard = CanvasBoard & {
  /** The file in the design folder, `Name.html` or the legacy `Name.dc.html`. */
  file?: string | undefined
  hash: string
  closure: string[]
  interactive: boolean
  fill: boolean
  /** True for a variant whose render hash still equals `baseHash`. */
  unchanged?: boolean | undefined
}

export type PageManifest = {
  id: string
  title: string
  icon?: string
  sections: CanvasSection[]
  boards: ManifestBoard[]
}

export type PageSummary = { id: string; title: string; icon?: string; boardCount: number; boards: string[] }
