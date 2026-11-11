/** A board at least this wide, with a fluid root, is a web page. */
export const PAGE_MIN_WIDTH = 1024

const FIXED_WIDTH = /(?:^|;)\s*width\s*:\s*\d+(?:\.\d+)?px/i

/**
 * The inline `style` of the board's root element: the first element inside `<x-dc>` after the
 * `<helmet>`. `null` when the board has no root element.
 */
export const rootStyleOf = (source: string): string | null => {
  const open = source.search(/<x-dc[\s>]/)
  if (open < 0) return null
  const body = source.slice(open).replace(/^<x-dc[^>]*>/, '')
  const rest = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<helmet[\s\S]*?<\/helmet>/, '')
  const tag = /<[a-z][\w-]*(\s[^>]*)?>/i.exec(rest)
  if (!tag) return null
  const style = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[1] ?? '')
  return style?.[1] ?? style?.[2] ?? ''
}

/** True when the root is not pinned to a px width, so the board can take any width. */
export const hasFluidRoot = (source: string): boolean => {
  const style = rootStyleOf(source)
  return style !== null && !FIXED_WIDTH.test(style)
}

/**
 * A page fills the window when played full screen, like the artifact's `"expand": "fill"`.
 * `expand` in `canvas.json` wins: `"fill"` is a page, any other value is not. Without it, a board
 * at least 1024 px wide with a fluid root is a page.
 */
export const fillsWindow = (expand: unknown, source: string | undefined, width: number): boolean => {
  if (expand !== undefined) return expand === 'fill'
  return source !== undefined && width >= PAGE_MIN_WIDTH && hasFluidRoot(source)
}
