import type { SectionColor } from '../lib/canvas-layout'

/**
 * The tokens of each section color, in one place for every part that draws one: `area` tints the
 * section on the canvas, `text` colors its label, and `dot` is the sidebar dot and the inspector
 * swatch. Tokens only.
 */
export const SECTION_TONES: Record<SectionColor, { area: string; text: string; dot: string }> = {
  gray: { area: 'var(--secondary)', text: 'var(--foreground)', dot: 'var(--muted-foreground)' },
  blue: { area: 'var(--info)', text: 'var(--info-foreground)', dot: 'var(--info-foreground)' },
  green: { area: 'var(--success)', text: 'var(--success-foreground)', dot: 'var(--success-foreground)' },
  amber: { area: 'var(--warning)', text: 'var(--warning-foreground)', dot: 'var(--warning-foreground)' },
  purple: { area: 'var(--rented)', text: 'var(--rented-foreground)', dot: 'var(--rented-foreground)' },
  red: { area: 'var(--destructive-tint)', text: 'var(--destructive)', dot: 'var(--destructive)' },
}
