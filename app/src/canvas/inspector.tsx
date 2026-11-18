'use client'

import { Button, cn, IconButton, Input, Select } from '../ui'
import { Check, ChevronDown, Columns3, CopyIcon, Grid3x3, Play, Rows3, WrapText } from '../ui/icons'
import Link from 'next/link'
import { useState } from 'react'
import { SECTION_TONES } from './section-colors'
import { canNest, sharedSection } from './sections'
import { DEFAULT_GAP, type TidyRequest } from './tidy-section'
import type { TidyMode } from './tidy'
import type { CanvasSection, ManifestBoard, PageSummary } from './types'

type SectionColor = NonNullable<CanvasSection['color']>
import { playHref } from './use-play-links'
import { VariantsBox } from './variants/variants-box'

const link =
  'block truncate rounded-md px-2 py-1 text-start text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
  )
}

const NONE = '\u0000none'
const MIXED = '\u0000mixed'

/** Pick one of the page's sections or None for every board in `names`. `Mixed` shows when their sections differ. */
function SectionField({
  names,
  boards,
  sections,
  onSection,
}: {
  names: string[]
  boards: { name: string; section?: string | undefined }[]
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
}) {
  const shared = sharedSection(names, boards)
  const value = shared === undefined ? MIXED : (shared ?? NONE)
  return (
    <Row label="Section">
      <Select
        aria-label="Section"
        className="h-9"
        value={value}
        onChange={(next) => {
          if (next === MIXED || next === value) return
          onSection(names, next === NONE ? null : next)
        }}
      >
        {shared === undefined ? (
          <option value={MIXED} disabled>
            Mixed
          </option>
        ) : null}
        <option value={NONE}>None</option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.title}
          </option>
        ))}
      </Select>
    </Row>
  )
}

const SWATCHES: { color: SectionColor; label: string }[] = [
  { color: 'gray', label: 'Gray' },
  { color: 'blue', label: 'Blue' },
  { color: 'green', label: 'Green' },
  { color: 'amber', label: 'Amber' },
  { color: 'purple', label: 'Purple' },
  { color: 'red', label: 'Red' },
]

/** Six swatches, one per section color; gray is the default and stores no color. */
function ColorRow({
  color,
  onPick,
}: {
  color: SectionColor | undefined
  onPick: (color: SectionColor | null) => void
}) {
  const current = color ?? 'gray'
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-normal text-muted-foreground">Color</h3>
      <div role="group" aria-label="Section color" className="flex items-center gap-2 p-0.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.color}
            type="button"
            aria-label={swatch.label}
            aria-pressed={current === swatch.color}
            onClick={() => onPick(swatch.color === 'gray' ? null : swatch.color)}
            className="m-0 box-border size-5 cursor-pointer rounded-full border border-border-strong p-0 outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-ring"
            style={{ background: SECTION_TONES[swatch.color].dot }}
          />
        ))}
      </div>
    </div>
  )
}

/** Several boards selected: the count, their names, the shared Section field and the section actions. */
export function InspectorMulti({
  names,
  boards,
  sections,
  onSection,
  onCreateSection,
  onDeleteSection,
  onColor,
  onTidy,
  gridFor = null,
}: {
  names: string[]
  boards: { name: string; title: string; section?: string | undefined }[]
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
  /** `nested`: make the section a sub-section of the one the boards share. */
  onCreateSection: (names: string[], nested?: boolean) => void
  onDeleteSection: (id: string) => void
  onColor: (id: string, color: SectionColor | null) => void
  /** Tidy the boards the section holds itself. */
  onTidy?: (id: string, request: TidyRequest) => void
  /** The section whose Tidy block opens on Grid. */
  gridFor?: string | null
}) {
  const shared = sharedSection(names, boards)
  const common =
    typeof shared === 'string' ? sections.find((section) => section.id === shared) : undefined
  const anySection = names.some(
    (name) => boards.find((board) => board.name === name)?.section !== undefined,
  )
  return (
    <aside
      aria-label="Inspector"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-border bg-card p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="m-0 truncate text-base font-semibold">{names.length} boards selected</h2>
        <p className="m-0 text-sm text-muted-foreground">{names.join(', ')}</p>
      </header>
      <dl className="m-0 flex flex-col gap-3">
        <SectionField names={names} boards={boards} sections={sections} onSection={onSection} />
      </dl>
      <section aria-label="Section actions" className="flex flex-col gap-2">
        <Button
          size="sm"
          className="justify-between"
          onClick={() => onCreateSection(names, false)}
        >
          <span>Create section</span>
          <kbd className="rounded-md border border-primary-foreground/40 px-1.5 py-px font-sans text-[11px] font-medium">
            Shift+S
          </kbd>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!anySection}
          onClick={() => onSection(names, null)}
        >
          Remove from section
        </Button>
        {common ? (
          <>
            <ColorRow color={common.color} onPick={(color) => onColor(common.id, color)} />
            {canNest(common.id, sections) ? (
              <Button variant="secondary" size="sm" onClick={() => onCreateSection(names, true)}>
                Create sub-section
              </Button>
            ) : null}
            {onTidy && boards.some((board) => board.section === common.id) ? (
              <TidyBlock
                key={`${common.id}:${gridFor === common.id}`}
                count={boards.filter((board) => board.section === common.id).length}
                layout={common.layout}
                grid={gridFor === common.id}
                onTidy={(request) => onTidy(common.id, request)}
              />
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => onDeleteSection(common.id)}>
              Delete section
            </Button>
          </>
        ) : null}
      </section>
    </aside>
  )
}

const TIDY_MODES: { mode: TidyMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'row', label: 'Row', icon: <Columns3 className="size-4" aria-hidden="true" /> },
  { mode: 'column', label: 'Column', icon: <Rows3 className="size-4" aria-hidden="true" /> },
  { mode: 'wrap', label: 'Wrap', icon: <WrapText className="size-4" aria-hidden="true" /> },
  { mode: 'grid', label: 'Grid', icon: <Grid3x3 className="size-4" aria-hidden="true" /> },
]

const whole = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && value.trim() !== '' ? Math.min(max, Math.max(min, parsed)) : fallback
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: number
  max: number
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] rounded-[10px] px-2.5 text-sm text-foreground"
      />
    </label>
  )
}

/** Tidy the boards a section holds: a layout, the gap, and for Grid its columns and rows. Remounts per section. */
function TidyBlock({
  count,
  layout,
  grid,
  onTidy,
}: {
  count: number
  layout: CanvasSection['layout']
  grid: boolean
  onTidy: (request: TidyRequest) => void
}) {
  const [mode, setMode] = useState<TidyMode>(grid ? 'grid' : layout ? 'wrap' : 'row')
  const [gap, setGap] = useState(String(layout?.gap ?? DEFAULT_GAP))
  const initialColumns = Math.max(1, Math.ceil(Math.sqrt(count)))
  const [columns, setColumns] = useState(String(initialColumns))
  const [rows, setRows] = useState(String(Math.ceil(count / initialColumns)))
  const editColumns = (value: string) => {
    setColumns(value)
    const next = whole(value, 0, 1, Math.max(1, count))
    if (next > 0) setRows(String(Math.ceil(count / next)))
  }
  const editRows = (value: string) => {
    setRows(value)
    const next = whole(value, 0, 1, Math.max(1, count))
    if (next > 0) setColumns(String(Math.ceil(count / next)))
  }
  const apply = () => {
    const request: TidyRequest = { mode, gap: whole(gap, DEFAULT_GAP, 0, 400) }
    if (mode === 'grid') {
      request.columns = whole(columns, initialColumns, 1, Math.max(1, count))
      request.rows = whole(rows, Math.ceil(count / request.columns), 1, Math.max(1, count))
    }
    onTidy(request)
  }
  return (
    <div role="group" aria-label="Tidy" className="flex flex-col gap-2">
      <h3 className="m-0 text-xs font-normal text-muted-foreground">Tidy</h3>
      <div
        role="radiogroup"
        aria-label="Layout"
        className="grid grid-cols-4 gap-0.5 rounded-[10px] border border-border bg-secondary p-0.5"
      >
        {TIDY_MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={option.mode === mode}
            onClick={() => setMode(option.mode)}
            className={cn(
              'flex h-12 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border bg-transparent p-0 text-[11px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              option.mode === mode ? 'border-border-strong bg-accent' : 'border-transparent',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
      <NumberField label="Gap" value={gap} min={0} max={400} onChange={setGap} />
      {mode === 'grid' ? (
        <div className="flex items-end gap-2">
          <NumberField label="Columns" value={columns} min={1} max={Math.max(1, count)} onChange={editColumns} />
          <span className="pb-2 text-sm text-muted-foreground">×</span>
          <NumberField label="Rows" value={rows} min={1} max={Math.max(1, count)} onChange={editRows} />
        </div>
      ) : null}
      {mode === 'wrap' ? (
        <p className="m-0 text-xs leading-4 text-muted-foreground">
          Frames reflow when you resize the section
        </p>
      ) : null}
      <Button size="sm" onClick={apply}>
        Tidy
      </Button>
    </div>
  )
}

const IMPORTS_COLLAPSED = 3

function ImportsList({
  imports,
  placed,
  ownerOf,
  onFocusBoard,
}: {
  imports: string[]
  placed: ReadonlySet<string>
  ownerOf: (name: string) => string | undefined
  onFocusBoard: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hidden = imports.length - IMPORTS_COLLAPSED
  const shown = expanded || hidden <= 0 ? imports : imports.slice(0, IMPORTS_COLLAPSED)
  return (
    <>
      <ul className="m-0 -mx-2 flex list-none flex-col p-0">
        {shown.map((name) => {
          const owner = ownerOf(name)
          return (
            <li key={name}>
              {placed.has(name) ? (
                <button
                  type="button"
                  className={`${link} w-full cursor-pointer`}
                  onClick={() => onFocusBoard(name)}
                >
                  {name}
                </button>
              ) : owner ? (
                <Link
                  className={link}
                  href={`/p/${encodeURIComponent(owner)}?board=${encodeURIComponent(name)}`}
                >
                  {name}
                </Link>
              ) : (
                <span className={`${link} text-muted-foreground`}>{name}</span>
              )}
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="-mx-2 mt-0.5 inline-flex cursor-pointer items-center gap-1 self-start rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden="true" className={`size-3 ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show fewer' : `Show ${hidden} more imports`}
        </button>
      )}
    </>
  )
}

/** The selected board: name, title, size, file path with copy, the boards it imports, and a link to play it full screen. */
export function Inspector({
  board,
  pageId,
  pages,
  placed,
  sections,
  onSection,
  onFocusBoard,
  variantsFocus = 0,
  onVariantsFocused,
  children,
}: {
  board: ManifestBoard
  pageId: string
  pages: PageSummary[]
  placed: ReadonlySet<string>
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
  onFocusBoard: (name: string) => void
  variantsFocus?: number
  onVariantsFocused?: (() => void) | undefined
  /** Actions on the board, shown above Play. */
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const path = `design/${board.name}.dc.html`
  const imports = board.closure.filter((name) => name !== board.name)
  const ownerOf = (name: string) => pages.find((page) => page.boards.includes(name))?.id

  const copy = () => {
    void navigator.clipboard?.writeText(path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside
      aria-label="Inspector"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-border bg-card p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="m-0 truncate text-base font-semibold">{board.name}</h2>
        <p dir="auto" className="m-0 text-sm text-muted-foreground">
          {board.title}
        </p>
      </header>
      <dl className="m-0 flex flex-col gap-3">
        <Row label="Size">
          <span className="tabular-nums">
            {board.width} × {board.height}
          </span>
        </Row>
        <Row label="File">
          <span className="flex items-center gap-1">
            <code className="min-w-0 flex-1 truncate text-xs">{path}</code>
            <IconButton
              label={copied ? 'Copied' : 'Copy path'}
              icon={copied ? <Check className="size-4" /> : <CopyIcon className="size-4" />}
              onClick={copy}
            />
          </span>
        </Row>
        <Row label={`Imports (${imports.length})`}>
          {imports.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <ImportsList
              key={board.name}
              imports={imports}
              placed={placed}
              ownerOf={ownerOf}
              onFocusBoard={onFocusBoard}
            />
          )}
        </Row>
        <SectionField
          names={[board.name]}
          boards={[board]}
          sections={sections}
          onSection={onSection}
        />
      </dl>
      <VariantsBox board={board} page={pageId} focusSignal={variantsFocus} onFocused={onVariantsFocused} />
      {children}
      <Button asChild variant="secondary" size="sm">
        <Link href={playHref(pageId, board.name, 'full')}>
          <Play className="size-3.5 fill-current" />
          Play
        </Link>
      </Button>
    </aside>
  )
}
