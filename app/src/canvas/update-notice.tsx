'use client'

import { useRef, useState } from 'react'
import { Button, cn } from '../ui'
import { Spinner } from '../ui/spinner'
import { useMountEffect } from './use-mount-effect'
import { useUpdate } from './use-update'

const COMMAND = 'irsim update'

export function UpdateNotice({ className }: { className?: string }) {
  const { notice, phase, error, restartFailed, running, dismiss, start } = useUpdate()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useMountEffect(() => () => clearTimeout(timer.current))

  if (notice === null) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND)
    } catch {
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  const { kind, version, releaseUrl } = notice
  const busy = phase === 'updating' || phase === 'restarting'
  const failed = phase === 'failed'

  const headline = failed
    ? 'The update failed'
    : phase === 'updating'
      ? `Updating to ${version}`
      : phase === 'restarting'
        ? `Restarting on ${version}`
        : kind === 'available'
          ? `irsim ${version} is available`
          : `irsim ${version} is installed`

  const detail = failed
    ? (error ?? 'The update failed.')
    : phase === 'updating'
      ? 'The canvas restarts when the download is installed.'
      : phase === 'restarting'
        ? 'The page reloads when the canvas answers.'
        : kind === 'available'
          ? `You have ${running ?? 'an older version'}.`
          : `This canvas still runs ${running ?? 'an older version'}. Restart it to use ${version}.`

  const busyLabel = phase === 'updating' ? `Downloading ${version}…` : 'Restarting the canvas…'

  return (
    <section
      aria-label="irsim update"
      lang="en"
      dir="ltr"
      className={cn(
        'flex flex-col gap-2 rounded-[10px] border border-border bg-card p-3 text-foreground',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{headline}</div>
          <div
            className={cn('mt-0.5 text-xs', failed ? 'text-destructive' : 'text-muted-foreground')}
          >
            {detail}
          </div>
        </div>
        {busy ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={dismiss}
            className="text-base leading-none text-muted-foreground"
          >
            ×
          </Button>
        )}
      </div>
      {busy ? (
        <div role="status" className="flex items-center gap-2 text-xs text-info-foreground">
          <Spinner className="size-3" />
          <span>{busyLabel}</span>
        </div>
      ) : null}
      {phase === 'idle' ? (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={start}>
            {kind === 'available' ? 'Update and restart' : 'Restart'}
          </Button>
          {kind === 'available' && releaseUrl ? (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              Release notes
            </a>
          ) : null}
        </div>
      ) : null}
      {failed && !restartFailed ? (
        <>
          <div className="text-xs text-muted-foreground">Run the update in a terminal:</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-secondary px-2 py-1.5 text-xs">
              {COMMAND}
            </code>
            <Button variant="secondary" size="sm" onClick={copy} className="h-7.5 px-2.5 text-xs">
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  )
}
