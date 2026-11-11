import type { ComponentProps } from 'react'
import { cn } from './cn'
import { Input as ShadInput } from './components/ui/input'
import { Textarea as ShadTextarea } from './components/ui/textarea'
import { SearchIcon } from './icons'

export const FIELD_EDGE = cn(
  'rounded-lg border border-input bg-card shadow-none transition-colors outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/12',
  'aria-invalid:border-destructive aria-invalid:ring-[0.5px] aria-invalid:ring-destructive',
  'disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-secondary disabled:opacity-70',
)

export const FIELD_TRIGGER = cn(
  FIELD_EDGE,
  'flex h-11 w-full items-center justify-between gap-2 px-3 text-start text-sm',
  'aria-expanded:border-ring aria-expanded:ring-3 aria-expanded:ring-ring/12',
  '[&>svg:last-child]:transition-transform aria-expanded:[&>svg:last-child]:rotate-180',
)

const SEARCH_HEADER =
  'h-10.5 w-full rounded-none border-x-0 border-t-0 border-border bg-transparent ps-9 pe-3 focus-visible:ring-0 '

export function SearchHeader(props: Omit<ComponentProps<typeof ShadInput>, 'className'>) {
  return (
    <div className="relative -mx-1.5 -mt-1.5">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input type="search" {...props} className={SEARCH_HEADER} />
    </div>
  )
}

const invalidAttr = (invalid: boolean | undefined, aria: ComponentProps<'input'>['aria-invalid']) =>
  invalid || (aria !== undefined && aria !== false && aria !== 'false') || undefined

export function Input({
  invalid,
  className,
  'aria-invalid': ariaInvalid,
  ...rest
}: ComponentProps<typeof ShadInput> & { invalid?: boolean }) {
  return (
    <ShadInput
      {...rest}
      aria-invalid={invalidAttr(invalid, ariaInvalid)}
      className={cn(
        FIELD_EDGE,
        'h-11 px-3',
        rest.dir === 'ltr' && rest.lang !== 'en' && 'rtl:text-right',
        className,
      )}
    />
  )
}

export function Textarea({
  invalid,
  className,
  'aria-invalid': ariaInvalid,
  ...rest
}: ComponentProps<typeof ShadTextarea> & { invalid?: boolean }) {
  return (
    <ShadTextarea
      {...rest}
      aria-invalid={invalidAttr(invalid, ariaInvalid)}
      className={cn(FIELD_EDGE, 'min-h-24 px-3 py-2.5 leading-relaxed', className)}
    />
  )
}
