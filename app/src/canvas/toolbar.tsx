'use client'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '../ui'
import { Hand, MessageSquare, MousePointer2, Play } from '../ui/icons'
import type { PlacedBoard } from './geometry'

export type Tool = 'move' | 'hand' | 'comment'

const FLOATING = 'shadow-[0_14px_36px_rgba(20,22,26,0.14)]'
const GROUP_LABEL = 'px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground'

function PlayGroup({
  label,
  boards,
  onPlay,
}: {
  label: string
  boards: PlacedBoard[]
  onPlay: (name: string) => void
}) {
  return (
    <div role="group" aria-label={label}>
      <div className={GROUP_LABEL}>{label}</div>
      {boards.map((board) => (
        <DropdownMenuItem key={board.name} onSelect={() => onPlay(board.name)}>
          <span dir="auto" className="min-w-0 truncate">
            {board.title || board.name}
          </span>
          <span className="ms-auto shrink-0 ps-4 text-xs text-muted-foreground">{board.name}</span>
        </DropdownMenuItem>
      ))}
    </div>
  )
}

/** The toolbar's Play menu: every board of the page, prototypes first. A pick plays it full screen. */
function PlayMenu({ boards, onPlay }: { boards: PlacedBoard[]; onPlay: (name: string) => void }) {
  const prototypes = boards.filter((board) => board.interactive)
  const others = boards.filter((board) => !board.interactive)
  return (
    <DropdownMenu dir="ltr">
      <DropdownMenuTrigger asChild disabled={boards.length === 0}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Play an artboard"
          title={boards.length === 0 ? 'This page has no artboards to play yet.' : 'Play an artboard'}
          className="size-9 rounded-md text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
        >
          <Play className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent lang="en" align="center" className="max-h-[60vh] min-w-64 max-w-96">
        {prototypes.length > 0 ? (
          <PlayGroup label="Prototypes" boards={prototypes} onPlay={onPlay} />
        ) : null}
        {prototypes.length > 0 && others.length > 0 ? <DropdownMenuSeparator /> : null}
        {others.length > 0 ? (
          <PlayGroup label="Static artboards" boards={others} onPlay={onPlay} />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Move (`V`), Hand (`H`) and Comment (`C`), then Play. Comment is the mode in which a click on a
 * board element starts a comment; Play opens a board full screen.
 */
export function Toolbar({
  tool,
  onTool,
  boards,
  onPlay,
}: {
  tool: Tool
  onTool: (tool: Tool) => void
  /** In reading order. */
  boards: PlacedBoard[]
  onPlay: (name: string) => void
}) {
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
      <div aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <PlayMenu boards={boards} onPlay={onPlay} />
    </div>
  )
}
