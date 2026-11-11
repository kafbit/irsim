'use client'

import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Combobox, type ComboOption } from './combobox'

export function Select({
  value,
  onChange,
  children,
  invalid,
  disabled = false,
  id,
  className,
  ref,
  onBlur,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string | number
  onChange: (value: string) => void
  children?: ReactNode
  invalid?: boolean
  disabled?: boolean
  id?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
  onBlur?: () => void
  'aria-label'?: string
  'aria-invalid'?: ComponentProps<'button'>['aria-invalid']
  'aria-describedby'?: string
}) {
  const isInvalid =
    invalid || (ariaInvalid !== undefined && ariaInvalid !== false && ariaInvalid !== 'false')
  return (
    <Combobox
      id={id}
      value={String(value)}
      options={readOptions(children)}
      onChange={onChange}
      invalid={isInvalid}
      disabled={disabled}
      className={className}
      ref={ref}
      onBlur={onBlur}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  )
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }

function readOptions(children: ReactNode): ComboOption[] {
  const out: ComboOption[] = []
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue
    if (child.type === 'option') {
      const { props } = child as ReactElement<OptionProps>
      out.push({
        value: String(props.value ?? ''),
        label: textOf(props.children),
        disabled: props.disabled ?? false,
      })
    } else if (child.type === Fragment || child.type === 'optgroup') {
      out.push(...readOptions((child as ReactElement<{ children?: ReactNode }>).props.children))
    } else {
      console.warn(
        'Select: a child that is not an <option>, <optgroup> or fragment was ignored. ' +
          'Pass the <option> elements themselves as children.',
      )
    }
  }
  return out
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node))
    return textOf((node as ReactElement<{ children?: ReactNode }>).props.children)
  return ''
}
