'use client'

import { IconButton } from '@kafbit/ui'
import { Hand, MessageSquare, MousePointer2 } from '@kafbit/ui/icons'

export type Tool = 'move' | 'hand' | 'comment'

const FLOATING = 'shadow-[0_14px_36px_rgba(20,22,26,0.14)]'

/** Move (`V`), Hand (`H`) and Comment (`C`). Comment is the mode in which a click on a board element starts a comment. */
export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  const active = 'bg-secondary text-foreground'
  return (
    <div
      className={`absolute start-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card p-1 ${FLOATING}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <IconButton
        label="Move (V)"
        icon={<MousePointer2 className="size-4" />}
        aria-pressed={tool === 'move'}
        className={tool === 'move' ? active : ''}
        onClick={() => onTool('move')}
      />
      <IconButton
        label="Hand (H)"
        icon={<Hand className="size-4" />}
        aria-pressed={tool === 'hand'}
        className={tool === 'hand' ? active : ''}
        onClick={() => onTool('hand')}
      />
      <IconButton
        label="Comment (C)"
        icon={<MessageSquare className="size-4" />}
        aria-pressed={tool === 'comment'}
        className={tool === 'comment' ? active : ''}
        onClick={() => onTool(tool === 'comment' ? 'move' : 'comment')}
      />
    </div>
  )
}
