'use client'

import { type Ref, useId, useState } from 'react'
import { cn } from './cn'
import { type ComboOption, closedFace, ComboRows, useActiveRow } from './combobox-rows'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { ChevronDown } from './icons'
import { FIELD_TRIGGER, SearchHeader } from './input'
import { useMatches, usePickerText, useSearchable } from './picker'
import { PlainSelect } from './plain-select'

export type { ComboOption }

type ComboboxProps = {
  id?: string | undefined
  value: string
  options: readonly ComboOption[]
  onChange: (value: string) => void
  onSearch?: ((query: string) => void) | undefined
  total?: number | undefined
  selectedLabel?: string | undefined
  placeholder?: string | undefined
  searchPlaceholder?: string | undefined
  emptyLabel?: string | undefined
  loading?: boolean | undefined
  loadingLabel?: string | undefined
  disabled?: boolean | undefined
  invalid?: boolean | undefined
  className?: string | undefined
  ref?: Ref<HTMLButtonElement> | undefined
  onBlur?: (() => void) | undefined
  'aria-label'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-required'?: boolean | undefined
}

export function Combobox(props: ComboboxProps) {
  const fallbackId = useId()
  const id = props.id ?? fallbackId
  const searchable = useSearchable(props.total ?? props.options.length)
  if (searchable) return <SearchList {...props} id={id} />
  const { value, options, selectedLabel } = props
  const rows =
    value && selectedLabel && !options.some((o) => o.value === value)
      ? [...options, { value, label: selectedLabel }]
      : options
  return (
    <PlainSelect
      id={id}
      value={value}
      options={rows}
      onChange={props.onChange}
      placeholder={props.placeholder}
      invalid={props.invalid ?? false}
      disabled={props.disabled ?? false}
      className={props.className}
      ref={props.ref}
      onBlur={props.onBlur}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby']}
      aria-required={props['aria-required']}
    />
  )
}

function SearchList({
  id,
  value,
  options,
  onChange,
  onSearch,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  loading = false,
  loadingLabel,
  disabled = false,
  invalid = false,
  className,
  ref,
  onBlur,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: ComboboxProps & { id: string }) {
  const text = usePickerText()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listId = useId()
  const matches = useMatches(options, query)
  const shown = onSearch ? options : matches
  const { chosen, text: label } = closedFace(options, value, selectedLabel)
  const { active, setActive, onKeyDown } = useActiveRow(shown, (option) => choose(option))
  const search = (next: string) => {
    setQuery(next)
    setActive(0)
    onSearch?.(next)
  }
  const choose = (option: ComboOption) => {
    onChange(option.value)
    setOpen(false)
    search('')
  }
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={ref}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        data-value={value}
        disabled={disabled}
        onBlur={open ? undefined : onBlur}
        className={cn(FIELD_TRIGGER, className)}
      >
        {chosen?.icon ? <span aria-hidden="true">{chosen.icon}</span> : null}
        <span className={cn('truncate', !label && 'text-muted-foreground')}>
          {label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        avoidCollisions={false}
        style={{
          width: 'max-content',
          minWidth: 'var(--radix-popover-trigger-width)',
          maxWidth: 'var(--radix-popover-content-available-width)',
          maxHeight: 'var(--radix-popover-content-available-height)',
        }}
        className="flex flex-col gap-1 overflow-hidden p-1.5"
      >
        <SearchHeader
          value={query}
          onChange={(e) => search(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder ?? text.search}
          aria-label={searchPlaceholder ?? text.search}
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
        />
        <div id={listId} role="listbox" className="min-h-0 overflow-y-auto">
          <ComboRows
            rows={shown}
            value={value}
            active={active}
            listId={listId}
            loading={loading}
            loadingLabel={loadingLabel ?? text.loading}
            emptyLabel={emptyLabel ?? text.empty}
            onChoose={choose}
            onHover={setActive}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
