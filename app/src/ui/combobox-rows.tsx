'use client'

import { type KeyboardEvent, type ReactNode, useState } from 'react'
import { cn } from './cn'
import { Check } from './icons'

export interface ComboOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean | undefined
  readonly icon?: ReactNode | undefined
  readonly shortLabel?: string | undefined
  readonly hint?: string | undefined
}

export function OptionText({ option }: { option: ComboOption }) {
  if (!option.hint) return <span className="min-w-0 flex-1 truncate">{option.label}</span>
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{option.label}</span>
      <span className="truncate text-xs font-normal text-muted-foreground">{option.hint}</span>
    </span>
  )
}

export function closedFace(
  options: readonly ComboOption[],
  value: string,
  selectedLabel: string | undefined,
): { chosen: ComboOption | undefined; text: string | undefined } {
  const chosen = options.find((o) => o.value === value)
  return {
    chosen,
    text: chosen?.shortLabel ?? chosen?.label ?? (value ? selectedLabel : undefined),
  }
}

export function ComboRows({
  rows,
  value,
  active,
  listId,
  loading,
  loadingLabel,
  emptyLabel,
  onChoose,
  onHover,
}: {
  rows: readonly ComboOption[]
  value: string
  active: number
  listId: string
  loading: boolean
  loadingLabel: string | undefined
  emptyLabel: string
  onChoose: (option: ComboOption) => void
  onHover: (index: number) => void
}) {
  if (loading || rows.length === 0)
    return (
      <p className="px-2.5 py-3.5 text-center text-[0.8125rem] text-muted-foreground">
        {loading ? (
          <span className="t-shimmer" data-text={loadingLabel}>
            {loadingLabel}
          </span>
        ) : (
          emptyLabel
        )}
      </p>
    )
  return rows.map((option, i) => (
    <div
      key={option.value}
      id={`${listId}-${i}`}
      role="option"
      tabIndex={-1}
      aria-selected={option.value === value}
      aria-disabled={option.disabled || undefined}
      data-value={option.value}
      onClick={() => (option.disabled ? undefined : onChoose(option))}
      onKeyDown={() => undefined}
      onMouseEnter={() => onHover(i)}
      className={cn(
        'flex min-h-9.5 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm',
        i === active && 'bg-accent',
        option.value === value && 'bg-accent font-semibold',
        option.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <OptionText option={option} />
      {option.value === value ? (
        <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.4} />
      ) : null}
    </div>
  ))
}

export function useActiveRow(
  rows: readonly ComboOption[],
  onChoose: (option: ComboOption) => void,
) {
  const [active, setActive] = useState(0)
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (rows.length ? (i + step + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const option = rows[active]
      if (option && !option.disabled) onChoose(option)
    }
  }
  return { active, setActive, onKeyDown }
}
