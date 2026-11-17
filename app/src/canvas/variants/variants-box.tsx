'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { PRESETS } from '../../lib/variant-presets'
import { Button, Textarea } from '../../ui'
import { SplitIcon } from '../../ui/icons-custom'
import { SessionRow } from '../comments/session-row'
import { useSession } from '../comments/use-session'
import type { ManifestBoard, PageManifest } from '../types'
import { useApi } from '../use-api'
import { compareHref, generateLabel, sentLabel, togglePreset, variantsOf } from './variants-model'

const HEADING = 'm-0 text-xs font-normal text-muted-foreground'

function CompareLink({ page, base, label }: { page: string; base: string; label: string }) {
  return (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link href={compareHref(page, base)}>{label}</Link>
    </Button>
  )
}

function VariantBoardBox({ board, page }: { board: ManifestBoard; page: string }) {
  const base = board.variantOf ?? ''
  return (
    <section aria-label="Variants" className="flex flex-col gap-2">
      <h3 className={HEADING}>Variants</h3>
      <p className="m-0 text-sm text-foreground">
        Variant of {base}: {board.variantLabel ?? board.name}
      </p>
      {board.unchanged ? (
        <p
          role="status"
          className="m-0 rounded-[10px] border border-border bg-secondary px-2.5 py-2 text-[13px] leading-5 text-foreground"
        >
          Not changed yet
        </p>
      ) : null}
      <CompareLink page={page} base={base} label="Compare" />
    </section>
  )
}

function BaseBoardBox({
  board,
  page,
  focusSignal,
}: {
  board: ManifestBoard
  page: string
  focusSignal: number
}) {
  const presets = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusSignal <= 0) return
    const first = presets.current?.querySelector('button')
    first?.focus()
    presets.current?.scrollIntoView({ block: 'nearest' })
  }, [focusSignal])
  const manifest = useApi<PageManifest>(`/api/pages/${encodeURIComponent(page)}`)
  const { sessions, loaded, sessionId, pick } = useSession()
  const [chosen, setChosen] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const existing =
    manifest.status === 'ready' ? variantsOf(manifest.data.boards, board.name).length : 0
  const sessionLabel = sessions.find((session) => session.id === sessionId)?.label ?? 'Claude'

  const generate = async () => {
    if (!sessionId || chosen.length === 0) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/variants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page,
          board: board.name,
          presets: chosen,
          note: note.trim() || undefined,
          sessionId,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        boards?: unknown[]
        error?: string
      }
      if (response.status !== 201) throw new Error(body.error ?? `HTTP ${response.status}`)
      setSent(body.boards?.length ?? chosen.length)
      setChosen([])
      setNote('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setPending(false)
    }
  }

  if (sent !== null) {
    return (
      <section aria-label="Variants" className="flex flex-col gap-2">
        <h3 className={HEADING}>Variants</h3>
        <p
          role="status"
          className="m-0 rounded-[10px] border border-border bg-secondary px-2.5 py-2 text-[13px] leading-5 text-foreground"
        >
          {sentLabel(sessionLabel, sent)}
        </p>
        <CompareLink page={page} base={board.name} label="Compare variants" />
        <Button variant="ghost" size="sm" onClick={() => setSent(null)}>
          Generate more
        </Button>
      </section>
    )
  }

  return (
    <section aria-label="Variants" className="flex flex-col gap-2">
      <h3 className={HEADING}>Variants</h3>
      <div ref={presets} role="group" aria-label="Presets" className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const on = chosen.includes(preset.label)
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={on}
              onClick={() => setChosen(togglePreset(chosen, preset.label))}
              className={`inline-flex h-[26px] cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring ${
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-strong bg-transparent text-foreground'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <Textarea
        aria-label="Note for Claude (optional)"
        placeholder="Note for Claude (optional)"
        className="min-h-14 text-sm"
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <SessionRow sessions={sessions} loaded={loaded} sessionId={sessionId} onPick={pick} />
      <Button
        size="sm"
        icon={<SplitIcon />}
        disabled={!sessionId || chosen.length === 0}
        pending={pending}
        onClick={() => void generate()}
      >
        {generateLabel(chosen.length)}
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {existing > 0 ? (
        <CompareLink
          page={page}
          base={board.name}
          label={`Compare ${existing} ${existing === 1 ? 'variant' : 'variants'}`}
        />
      ) : null}
    </section>
  )
}

/** Variants of the selected board: presets to generate them for a base board, a link to compare them for either. */
export function VariantsBox({
  board,
  page,
  focusSignal = 0,
}: {
  board: ManifestBoard
  page: string
  focusSignal?: number
}) {
  return board.variantOf ? (
    <VariantBoardBox board={board} page={page} />
  ) : (
    <BaseBoardBox key={board.name} board={board} page={page} focusSignal={focusSignal} />
  )
}
