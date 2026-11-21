'use client'

import { ArrowUp, Paperclip } from 'lucide-react'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PRESETS } from '../lib/variant-presets'
import { Button, Textarea, cn } from '../ui'
import { ChevronDown, Sparkles } from '../ui/icons'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/ui/popover'
import { ImageStrip } from './comments/image-strip'
import { usePastedImages } from './comments/use-pasted-images'
import { useSession } from './comments/use-session'
import {
  COMPOSER_PLACEHOLDER,
  type ComposerScope,
  askScope,
  canGenerate,
  canSend,
  hintFor,
  scopeLabel,
} from './composer-model'
import { sendAsk } from './page-requests'
import { generateLabel, togglePreset } from './variants/variants-model'

const ICON_BUTTON =
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50'

const BARE_FIELD =
  'min-h-5 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-5 shadow-none focus-visible:border-0 focus-visible:ring-0 disabled:bg-transparent'

const postVariants = async (input: {
  page: string
  board: string
  presets: string[]
  note: string
  images: string[]
  sessionId: string
}): Promise<void> => {
  const response = await fetch('/api/variants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...input,
      note: input.note || undefined,
      images: input.images.length > 0 ? input.images : undefined,
    }),
  })
  if (response.status === 201) return
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? `HTTP ${response.status}`)
}

function OptionsMenu({
  open,
  onOpenChange,
  enabled,
  onToggle,
  chosen,
  onChoose,
  iconOnly,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabled: boolean
  onToggle: () => void
  chosen: string[]
  onChoose: (label: string) => void
  iconOnly: boolean
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            aria-haspopup="menu"
            aria-label="Options"
            className={cn(ICON_BUTTON, open && 'bg-accent')}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            aria-haspopup="menu"
            className={cn(
              'cursor-pointer border-0 bg-transparent p-0 text-xs underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              open ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            Options
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        dir="ltr"
        lang="en"
        align="end"
        role="menu"
        aria-label="Options"
        className="flex w-65 flex-col gap-2 rounded-[10px] p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium">Generate variants</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Generate variants"
            onClick={onToggle}
            className={cn(
              'relative h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-0 p-0 focus-visible:outline-2 focus-visible:outline-ring',
              enabled ? 'bg-primary' : 'bg-border-strong',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3.5 rounded-full bg-primary-foreground',
                enabled ? 'end-0.5' : 'start-0.5',
              )}
            />
          </button>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          The agent edits copies of the board and you compare them.
        </p>
        {enabled ? (
          <div role="group" aria-label="Presets" className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const on = chosen.includes(preset.label)
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChoose(preset.label)}
                  className={cn(
                    'inline-flex h-6.5 cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border-strong bg-transparent text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** The prompt box that talks to the agent session. `hero` is the large empty-state box, `slim` one line. */
export function AgentComposer({
  page,
  scope,
  size = 'hero',
  narrow = false,
  focusSignal = 0,
  optionsSignal = 0,
  onSent,
}: {
  page: string
  scope: ComposerScope
  size?: 'hero' | 'slim'
  narrow?: boolean
  focusSignal?: number
  optionsSignal?: number
  onSent?: () => void
}) {
  const { loaded, sessionId } = useSession()
  const pasted = usePastedImages()
  const picker = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [variants, setVariants] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])

  const field = useRef<HTMLTextAreaElement>(null)
  const focused = useRef(focusSignal)
  useEffect(() => {
    if (focusSignal === focused.current) return
    focused.current = focusSignal
    field.current?.focus()
  }, [focusSignal])
  const opened = useRef(optionsSignal)
  useEffect(() => {
    if (optionsSignal === opened.current) return
    opened.current = optionsSignal
    setVariants(true)
    setMenuOpen(true)
  }, [optionsSignal])
  const [wrapped, setWrapped] = useState(false)
  useLayoutEffect(() => {
    const node = field.current
    if (node) setWrapped(node.scrollHeight > 24)
  }, [text])

  const slim = size === 'slim'
  const label = slim ? null : scopeLabel(scope)
  const board = scope.kind === 'board' ? scope.name : null
  const generating = variants && board !== null
  const ready = generating
    ? canGenerate({ sessionId, presets: chosen.length, pending })
    : canSend({ text, sessionId, uploading: pasted.uploading, pending })

  const submit = async () => {
    if (!ready || sessionId === null) return
    setPending(true)
    setError(null)
    try {
      if (generating && board !== null) {
        await postVariants({
          page,
          board,
          presets: chosen,
          note: text.trim(),
          images: pasted.images,
          sessionId,
        })
        pasted.reset([])
        setVariants(false)
        setChosen([])
      } else {
        await sendAsk({
          sessionId,
          page,
          prompt: text.trim(),
          ...(pasted.images.length > 0 ? { images: pasted.images } : {}),
          ...askScope(scope),
        })
        pasted.reset([])
      }
      setText('')
      onSent?.()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setPending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit()
  }

  const textarea = (
    <Textarea
      ref={field}
      aria-label="Message to the agent"
      placeholder={COMPOSER_PLACEHOLDER}
      rows={1}
      maxLength={8000}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={onKeyDown}
      onPaste={pasted.onPaste}
      className={cn(
        BARE_FIELD,
        'min-w-0 flex-1 placeholder:text-foreground',
        loaded && sessionId === null && 'text-muted-foreground',
        slim && 'truncate',
      )}
    />
  )
  const fileInput = (
    <input
      ref={picker}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(event) => {
        pasted.addFiles(Array.from(event.target.files ?? []))
        event.target.value = ''
      }}
    />
  )
  const options =
    board !== null ? (
      <OptionsMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        enabled={generating}
        onToggle={() => setVariants((on) => !on)}
        chosen={chosen}
        onChoose={(preset) => setChosen((list) => togglePreset(list, preset))}
        iconOnly={slim}
      />
    ) : null
  const sendLabel = generating ? generateLabel(chosen.length) : 'Send'
  const round = !slim && wrapped
  const hint = hintFor(sessionId, loaded)
  const showHint = !narrow && scope.kind === 'none'

  return (
    <div className="relative flex flex-col gap-1.5">
      <div
        className={cn(
          'flex min-h-11 items-center gap-2 border border-border-strong bg-card py-1.5 ps-3 pe-1.5',
          round ? 'rounded-[22px]' : 'rounded-full',
        )}
      >
        <Sparkles
          size={16}
          aria-hidden="true"
          className={cn('shrink-0 text-foreground', round && 'mt-1.5 self-start')}
        />
        {textarea}
        {slim ? (
          <>
            {fileInput}
            <button
              type="button"
              aria-label="Attach images"
              onClick={() => picker.current?.click()}
              className={ICON_BUTTON}
            >
              <Paperclip size={16} aria-hidden="true" />
            </button>
            {options}
          </>
        ) : null}
        <Button
          size="sm"
          aria-label={sendLabel}
          disabled={!ready}
          pending={pending}
          onClick={() => void submit()}
          className={cn(
            'h-8 min-w-8 shrink-0 self-end rounded-full p-0 text-[13px] font-medium',
            generating && 'px-3',
          )}
        >
          {generating ? <span>{sendLabel}</span> : null}
          <ArrowUp size={16} aria-hidden="true" />
        </Button>
      </div>
      <ImageStrip
        images={pasted.images}
        uploading={pasted.uploading}
        message={pasted.message}
        onRemove={pasted.remove}
      />
      {slim ? null : (
        <div className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
          {fileInput}
          {label ? <span className="min-w-0 truncate">About {label}</span> : null}
          {showHint ? <span className="min-w-0 truncate">{hint}</span> : null}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted-foreground underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Attach
          </button>
          {options}
        </div>
      )}
      {error ? (
        <p role="alert" className="m-0 px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
