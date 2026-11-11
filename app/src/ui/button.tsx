import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { Button as ShadButton } from './components/ui/button'
import { Spinner } from './spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<ButtonVariant, ComponentProps<typeof ShadButton>['variant']> = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive',
  ghost: 'ghost',
}

export function Button({
  variant = 'primary',
  icon,
  className,
  children,
  type = 'button',
  asChild = false,
  pending = false,
  pendingLabel,
  disabled,
  ...rest
}: Omit<ComponentProps<typeof ShadButton>, 'variant'> & {
  variant?: ButtonVariant
  icon?: ReactNode
  pending?: boolean
  pendingLabel?: ReactNode
}) {
  if (asChild) {
    return (
      <ShadButton
        asChild
        variant={VARIANTS[variant]}
        data-intent={variant}
        className={cn('gap-2', className)}
        {...rest}
      >
        {children}
      </ShadButton>
    )
  }
  return (
    <ShadButton
      type={type}
      variant={VARIANTS[variant]}
      data-intent={variant}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={cn('gap-2', className)}
      {...rest}
    >
      {pending || icon ? (
        <span data-icon="inline-start" className="-ms-0.5">
          {pending ? <Spinner /> : icon}
        </span>
      ) : null}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </ShadButton>
  )
}
