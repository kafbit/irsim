'use client'

import type { Ref } from 'react'
import { cn } from './cn'
import { type ComboOption, closedFace, OptionText } from './combobox-rows'
import { Select as Root, SelectContent, SelectItem, SelectTrigger } from './components/ui/select'
import { FIELD_TRIGGER } from './input'

export function PlainSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  invalid = false,
  disabled = false,
  className,
  ref,
  onBlur,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: {
  id: string
  value: string
  options: readonly ComboOption[]
  onChange: (value: string) => void
  placeholder?: string | undefined
  invalid?: boolean
  disabled?: boolean
  className?: string | undefined
  ref?: Ref<HTMLButtonElement> | undefined
  onBlur?: (() => void) | undefined
  'aria-label'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-required'?: boolean | undefined
}) {
  // Radix refuses '' as an item value, so the empty option carries a stand-in inside
  const empty = options.find((o) => o.value === '')
  const toInner = (v: string) => (v === '' && empty ? EMPTY : v)
  const toOuter = (v: string) => (v === EMPTY ? '' : v)
  const { chosen, text } = closedFace(options, value, undefined)

  return (
    <Root
      value={toInner(value)}
      onValueChange={(next) => onChange(toOuter(next))}
      disabled={disabled}
    >
      <SelectTrigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        onBlur={onBlur}
        data-value={value}
        className={cn(FIELD_TRIGGER, className)}
      >
        {chosen?.icon ? (
          <span aria-hidden="true" className="me-1.5 inline-flex">
            {chosen.icon}
          </span>
        ) : null}
        {text ?? <span className="text-muted-foreground">{placeholder}</span>}
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY}
            value={toInner(option.value)}
            disabled={option.disabled ?? false}
            data-value={option.value}
            textValue={option.label}
          >
            {option.hint ? <OptionText option={option} /> : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Root>
  )
}

const EMPTY = '\u0000empty'
