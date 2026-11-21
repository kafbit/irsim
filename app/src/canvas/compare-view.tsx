'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '../ui'
import { ChevronLeft } from '../ui/icons'
import { Shell, Status } from './canvas'
import type { ManifestBoard, PageManifest } from './types'
import { useEvents } from './comments/use-events'
import { useApi } from './use-api'
import { useTheme } from './use-theme'
import {
  canvasHref,
  columnScale,
  COMPARE_WIDTHS,
  confirmText,
  type CompareWidth,
  isCompareWidth,
  isNarrow,
  mountLimit,
  NARROW_COLUMN,
  variantsOf,
  widthOf,
} from './variants/variants-model'

const noop = () => {}
const WIDTH_KEY = 'canvas:compare-width'
const SETTLE_MS = 8000

const readWidth = (): CompareWidth => {
  try {
    const stored = localStorage.getItem(WIDTH_KEY)
    return isCompareWidth(stored) ? stored : 'board'
  } catch {
    return 'board'
  }
}

function Pills<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onPick(option.id)}
          className={`inline-flex h-[26px] cursor-pointer items-center rounded-md border-0 px-2.5 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring ${
            option.id === value
              ? 'bg-secondary font-semibold text-foreground'
              : 'bg-transparent font-medium text-muted-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Column({
  board,
  base,
  width,
  narrow,
  mount,
  onSettled,
  disabled,
  confirm,
  onAsk,
  onCancel,
  onChoose,
}: {
  board: ManifestBoard
  base: boolean
  width: number
  narrow: boolean
  mount: boolean
  onSettled: () => void
  disabled: boolean
  /** The confirmation shown in place of the button, or `null`. */
  confirm: { title: string; text: string; action: string } | null
  onAsk: () => void
  onCancel: () => void
  onChoose: () => void
}) {
  const [box, setBox] = useState({ width: 0, height: 0 })
  const frame = useRef<HTMLIFrameElement>(null)
  const settled = useRef(false)
  const confirmId = useId()
  /** After Cancel or Escape, focus goes back to the button that opened the confirmation. */
  const refocus = useRef(false)
  const cancel = () => {
    refocus.current = true
    onCancel()
  }
  // The safe choice gets focus when the confirmation opens, so a keyboard user lands inside it.
  const focusCancel = useCallback((element: HTMLButtonElement | null) => element?.focus(), [])
  const focusAgain = useCallback((element: HTMLButtonElement | null) => {
    if (element && refocus.current) {
      refocus.current = false
      element.focus()
    }
  }, [])

  const settle = useCallback(() => {
    if (settled.current) return
    settled.current = true
    onSettled()
  }, [onSettled])

  // Syncs with the column's size, an external system: the board refits when the window changes.
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Syncs with the frame window, an external system: it announces `ready` once the board is drawn.
  useEffect(() => {
    if (!mount) return
    const onMessage = (event: MessageEvent<{ type?: unknown }>) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'ready' || event.data?.type === 'error') settle()
    }
    window.addEventListener('message', onMessage)
    const timer = window.setTimeout(settle, SETTLE_MS)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
  }, [mount, settle])

  const k = columnScale(width, box.width)
  const shown = width * k
  const height = k > 0 ? box.height / k : 0

  return (
    <section
      aria-label={base ? 'Original' : (board.variantLabel ?? board.name)}
      className="flex min-h-0 min-w-0 flex-col gap-3"
      style={narrow ? { flex: '0 0 auto', width: NARROW_COLUMN } : { flex: '1 1 0' }}
    >
      <div
        className="flex flex-col items-center gap-0.5 self-center text-center"
        style={{ width: shown > 0 ? shown : '100%', maxWidth: '100%' }}
      >
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm font-semibold">
            {base ? 'Original' : (board.variantLabel ?? board.name)}
          </span>
          {!base && board.unchanged ? (
            <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-secondary px-2 text-xs text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-blue-600" />
              Not changed yet
            </span>
          ) : null}
        </div>
        <span className="max-w-full truncate text-xs text-muted-foreground">{board.name}</span>
      </div>
      <div ref={measure} className="min-h-0 flex-1">
        <div
          className="relative mx-auto h-full"
          style={{ width: shown > 0 ? shown : '100%', maxWidth: '100%' }}
        >
          {!base && board.unchanged ? (
            <div className="aura" role="status" aria-label="The agent is generating this variant" />
          ) : null}
          <div className="relative h-full overflow-hidden rounded-xl border border-border bg-card">
            {mount && k > 0 ? (
              <iframe
                ref={frame}
                key={board.hash}
                src={`/b/${encodeURIComponent(board.name)}?h=${board.hash}`}
                title={board.name}
                sandbox="allow-scripts allow-same-origin"
                className="absolute top-0 left-0 block origin-top-left border-0 bg-white"
                style={{ width, height, transform: `scale(${k})` }}
              />
            ) : null}
          </div>
        </div>
      </div>
      {confirm ? (
        <div
          role="alertdialog"
          aria-labelledby={`${confirmId}-title`}
          aria-describedby={`${confirmId}-text`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disabled) {
              event.preventDefault()
              cancel()
            }
          }}
          className="flex flex-col gap-2.5 rounded-xl border border-border-strong bg-card p-3"
        >
          <p className="m-0 text-[13px] leading-[18px]">
            <span id={`${confirmId}-title`} className="font-semibold">
              {confirm.title}
            </span>
            <br />
            <span id={`${confirmId}-text`} className="text-muted-foreground">
              {confirm.text}
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button
              ref={focusCancel}
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button size="sm" pending={disabled} onClick={onChoose}>
              {confirm.action}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={focusAgain}
          variant={base ? 'secondary' : 'primary'}
          size="sm"
          className="max-w-full self-center"
          style={{ width: shown > 0 ? shown : '100%' }}
          disabled={disabled}
          onClick={onAsk}
        >
          {base ? 'Keep original' : 'Choose'}
        </Button>
      )}
    </section>
  )
}

function Compare({ manifest, base }: { manifest: PageManifest; base: ManifestBoard }) {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const [choice, setChoice] = useState<CompareWidth>('board')
  const [settled, setSettled] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The board whose Choose or Keep original waits for its confirmation. */
  const [asking, setAsking] = useState<string | null>(null)

  // Syncs with localStorage, an external system: the stored width applies after hydration.
  useEffect(() => {
    setChoice(readWidth())
  }, [])

  const pickWidth = (next: CompareWidth) => {
    setChoice(next)
    try {
      localStorage.setItem(WIDTH_KEY, next)
    } catch {}
  }

  const boards = [base, ...variantsOf(manifest.boards, base.name)]
  const width = widthOf(choice, base)
  const narrow = isNarrow(choice)
  const back = canvasHref(manifest.id, base.name)
  const onSettled = useCallback(() => setSettled((count) => count + 1), [])

  const choose = async (pick: string) => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/variants/choose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: manifest.id, base: base.name, pick }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      router.push(back)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setPending(false)
    }
  }

  const limit = mountLimit(settled)
  const confirmOf = (board: ManifestBoard) =>
    confirmText({
      base: base.name,
      pick: board.name,
      label: board.variantLabel ?? board.name,
      variants: boards.length - 1,
    })

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-shell">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={back}>
            <ChevronLeft className="size-4" />
            Back to canvas
          </Link>
        </Button>
        <h1 className="m-0 min-w-0 flex-1 truncate text-base leading-6 font-semibold">
          {base.name} variants
        </h1>
        <Pills
          label="Width"
          value={choice}
          onPick={pickWidth}
          options={COMPARE_WIDTHS.map((id) => ({
            id,
            label: id === 'board' ? 'Board width' : id,
          }))}
        />
        <Pills
          label="Theme"
          value={theme}
          onPick={(next) => next !== theme && toggle()}
          options={[
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => (confirmOf(base) ? setAsking(base.name) : void choose(base.name))}
        >
          Discard variants
        </Button>
      </header>
      {error ? (
        <p
          role="alert"
          className="m-0 shrink-0 border-b border-border bg-warning px-4 py-2 text-sm text-warning-foreground"
        >
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 justify-start gap-4 overflow-x-auto p-4 [&>:first-child]:ms-auto [&>:last-child]:me-auto">
        {boards.map((board, index) => (
          <Column
            key={board.name}
            board={board}
            base={index === 0}
            width={width}
            narrow={narrow}
            mount={index < limit}
            onSettled={onSettled}
            disabled={pending}
            confirm={asking === board.name ? confirmOf(board) : null}
            onAsk={() => (confirmOf(board) ? setAsking(board.name) : void choose(board.name))}
            onCancel={() => setAsking(null)}
            onChoose={() => void choose(board.name)}
          />
        ))}
      </div>
    </div>
  )
}

/** `/p/<page>/compare/<base>`: the base board and its variants side by side, live, with a Choose for each. */
export function CompareRoute({ pageId, base }: { pageId: string; base: string }) {
  const manifest = useApi<PageManifest>(`/api/pages/${encodeURIComponent(pageId)}`)
  const { refetch } = manifest
  const refresh = useCallback(() => refetch(), [refetch])
  useEvents({ onBoard: refresh, onComments: noop, onShared: refresh, onCanvas: refresh })
  const board = manifest.status === 'ready' ? manifest.data.boards.find((b) => b.name === base) : null
  return (
    <Shell>
      {manifest.status === 'ready' && board ? (
        <Compare manifest={manifest.data} base={board} />
      ) : (
        <Status
          state={manifest.status === 'ready' ? { status: 'missing' } : manifest}
          missing={`No board named ${base} on ${pageId}.`}
        />
      )}
    </Shell>
  )
}
