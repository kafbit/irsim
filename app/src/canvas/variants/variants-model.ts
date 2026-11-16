import type { ManifestBoard } from '../types'

export const COMPARE_WIDTHS = ['board', '1280', '768', '390'] as const
export type CompareWidth = (typeof COMPARE_WIDTHS)[number]

export const NARROW_COLUMN = 392
export const MAX_CONCURRENT_MOUNTS = 2

export const togglePreset = (chosen: readonly string[], label: string): string[] =>
  chosen.includes(label) ? chosen.filter((item) => item !== label) : [...chosen, label]

export const generateLabel = (count: number): string =>
  count === 0 ? 'Generate' : `Generate ${count} ${count === 1 ? 'variant' : 'variants'}`

export const sentLabel = (session: string, count: number): string =>
  `Sent to ${session}. ${count} ${count === 1 ? 'variant is' : 'variants are'} on the canvas.`

export const compareHref = (page: string, base: string): string =>
  `/p/${encodeURIComponent(page)}/compare/${encodeURIComponent(base)}`

export const canvasHref = (page: string, base: string): string =>
  `/p/${encodeURIComponent(page)}?board=${encodeURIComponent(base)}`

export const variantsOf = (boards: readonly ManifestBoard[], base: string): ManifestBoard[] =>
  boards.filter((board) => board.variantOf === base)

export const widthOf = (choice: CompareWidth, base: { width: number }): number =>
  choice === 'board' ? base.width : Number(choice)

export const isCompareWidth = (value: unknown): value is CompareWidth =>
  typeof value === 'string' && (COMPARE_WIDTHS as readonly string[]).includes(value)

/** The scale that fits a board `width` wide into a column `column` wide, never above 1. */
export const columnScale = (width: number, column: number): number =>
  column <= 0 || width <= 0 ? 0 : Math.min(1, column / width)

export const isNarrow = (choice: CompareWidth): boolean => choice === '390'

/** How many columns may mount now: the first ones at once, then one more per column that settled. */
export const mountLimit = (settled: number): number => MAX_CONCURRENT_MOUNTS + settled

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The confirmation for Choose (`pick` is a variant) or Keep original (`pick` is the base): what the
 * pick replaces, and what is deleted. `variants` counts the base's variants.
 */
export const confirmText = (input: {
  base: string
  pick: string
  label: string
  variants: number
}): { title: string; text: string; action: string } => {
  if (input.pick === input.base) {
    return {
      title: 'Keep the original?',
      text: `The ${plural(input.variants, 'variant')} ${input.variants === 1 ? 'is' : 'are'} deleted.`,
      action: 'Keep original',
    }
  }
  const others = input.variants - 1
  return {
    title: `Replace ${input.base} with ${input.label}?`,
    text:
      others === 0
        ? 'The original is deleted.'
        : `The original and the other ${others === 1 ? 'variant are' : `${others} variants are`} deleted.`,
    action: 'Replace',
  }
}
