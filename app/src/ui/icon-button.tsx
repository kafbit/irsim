'use client'

import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { Button as ShadButton } from './components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  shape = 'square',
  className,
  ...rest
}: Omit<ComponentProps<typeof ShadButton>, 'children' | 'size'> & {
  label: string
  icon: ReactNode
  shape?: 'square' | 'circle'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ShadButton
          type={rest.asChild ? undefined : 'button'}
          variant={variant}
          size="icon"
          aria-label={label}
          className={cn(
            "relative size-9 rounded-md after:absolute after:-inset-1 after:content-['']",
            variant === 'ghost' &&
              'text-muted-foreground hover:text-foreground aria-expanded:text-foreground',
            shape === 'circle' && 'rounded-full after:rounded-full',
            className,
          )}
          {...rest}
        >
          {icon}
        </ShadButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
