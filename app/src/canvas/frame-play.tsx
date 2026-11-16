'use client'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui'
import { Play } from '../ui/icons'
import type { PointerEvent } from 'react'
import type { PlayMode } from './use-play-links'

// A pointer that starts here is not a pan, a tap on the canvas or a title drag. Menu items are in
// a portal, but React still bubbles their events through this element.
const keep = (event: PointerEvent) => event.stopPropagation()

/**
 * The Play chip at the end of a frame's title row. A prototype gets "Play" with "Play on canvas"
 * and "Play full screen"; a board that is playing on the canvas gets "Stop".
 */
export function FramePlay({
  name,
  title,
  playing,
  onPlay,
  onStop,
}: {
  name: string
  title: string
  playing: boolean
  onPlay: (name: string, mode: PlayMode) => void
  onStop: (name: string) => void
}) {
  return (
    <div
      className="pointer-events-auto ms-auto flex shrink-0 items-center pb-1 in-data-labels-off:invisible"
      onPointerDown={keep}
    >
      {playing ? (
        <Button
          size="xs"
          aria-label={`Stop playing ${title || name}`}
          onClick={() => onStop(name)}
          className="border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
        >
          Stop
        </Button>
      ) : (
        <DropdownMenu dir="ltr">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Play prototype ${title || name}`}
              icon={<Play className="size-3 fill-current" />}
              className="text-blue-600 hover:bg-blue-600/10 hover:text-blue-700 aria-expanded:bg-blue-600/10 @max-[200px]:pe-1.5 dark:text-blue-400"
            >
              <span className="@max-[200px]:hidden">Play</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent lang="en" align="end" className="min-w-40" onPointerDown={keep}>
            <DropdownMenuItem onSelect={() => onPlay(name, 'canvas')}>Play on canvas</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onPlay(name, 'full')}>Play full screen</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
