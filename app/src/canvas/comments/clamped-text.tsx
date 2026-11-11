'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { isClamped } from './model'

type Props = {
  text: string
  className?: string
}

/** Text clamped to 4 lines. A "Show more" button appears only when the text overflows, and "Show less" collapses it again. */
export function ClampedText({ text, className = '' }: Props) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // Measures the laid-out text and follows width changes: layout is an external system.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || expanded) return
    const measure = () => setOverflowing(isClamped(element.scrollHeight, element.clientHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <>
      <p
        ref={ref}
        dir="auto"
        className={`m-0 text-start break-words whitespace-pre-wrap ${
          expanded ? '' : 'line-clamp-4'
        } ${className}`}
      >
        {text}
      </p>
      {overflowing || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="cursor-pointer self-start p-0 text-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </>
  )
}
