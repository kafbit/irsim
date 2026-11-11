export interface FormatContext {
  readonly locale: 'ar-SA' | 'en-GB'
  readonly numerals: 'arabic_indic' | 'western'
  readonly timezone: string
}

const numberingSystem = (ctx: FormatContext): 'arab' | 'latn' =>
  ctx.numerals === 'arabic_indic' && ctx.locale === 'ar-SA' ? 'arab' : 'latn'

export function formatNumber(value: number, ctx: FormatContext): string {
  return new Intl.NumberFormat(`${ctx.locale}-u-nu-${numberingSystem(ctx)}`, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}
