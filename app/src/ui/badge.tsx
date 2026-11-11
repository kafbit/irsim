import type { ReactNode } from 'react'
import { cn } from './cn'
import { Badge as ShadBadge } from './components/ui/badge'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'rented' | 'new'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info text-info-foreground',
  rented: 'bg-rented text-rented-foreground',
  new: 'bg-highlight text-highlight-foreground',
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  children,
  className,
}: {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <ShadBadge
      variant="outline"
      data-tone={tone}
      className={cn(
        'gap-1.5 border-transparent font-semibold',
        size === 'sm' ? 'h-5 px-2 text-[0.6875rem]' : 'h-6 px-2.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          data-slot="badge-dot"
          className="size-1.5 rounded-full bg-current"
        />
      ) : null}
      {children}
    </ShadBadge>
  )
}
