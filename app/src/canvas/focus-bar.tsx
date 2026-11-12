'use client'

import { Button } from '../ui'

/**
 * Shown while a board plays on the canvas: the frame takes the pointer, the wheel and the keyboard,
 * so the canvas does not pan until Esc or Exit.
 */
export function FocusBar({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <div
      role="status"
      lang="en"
      dir="ltr"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute start-1/2 top-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-blue-600 bg-card py-1 ps-3 pe-1 text-sm shadow-[0_14px_36px_rgba(20,22,26,0.14)]"
    >
      <span className="max-w-64 truncate">
        <bdi className="font-medium">{title}</bdi> is focused
      </span>
      <span className="text-muted-foreground">
        <kbd className="rounded border border-border px-1 font-sans text-xs">Esc</kbd> to exit
      </span>
      <Button
        size="xs"
        onClick={onExit}
        className="border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
      >
        Exit
      </Button>
    </div>
  )
}
