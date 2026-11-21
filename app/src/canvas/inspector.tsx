'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '../ui'
import { Check, ChevronDown, ChevronRight, CopyIcon, Play } from '../ui/icons'
import { ArrangeDialog } from './arrange-dialog'
import { AgentComposer } from './composer'
import { SECTION_TONES } from './section-colors'
import { canNest, sharedSection } from './sections'
import type { TidyRequest } from './tidy-section'
import type { CanvasSection, ManifestBoard, PageSummary } from './types'
import { playHref } from './use-play-links'
import { VariantsBox } from './variants/variants-box'

type SectionColor = NonNullable<CanvasSection['color']>

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

/** Several boards selected: the count, their names, the Section menu and Arrange. */
export function InspectorMulti({
  names,
  boards,
  sections,
  onSection,
  onCreateSection,
  onDeleteSection,
  onColor,
  onArrange,
}: {
  names: string[]
  boards: { name: string; title: string; section?: string | undefined }[]
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
  /** `nested`: make the section a sub-section of the one the boards share. */
  onCreateSection: (names: string[], nested?: boolean) => void
  onDeleteSection: (id: string) => void
  onColor: (id: string, color: SectionColor | null) => void
  /** Arrange the boards the shared section holds itself. */
  onArrange?: (id: string, request: TidyRequest) => void
}) {
  const [arranging, setArranging] = useState(false)
  const shared = sharedSection(names, boards)
  const common =
    typeof shared === 'string' ? sections.find((section) => section.id === shared) : undefined
  const anySection = names.some(
    (name) => boards.find((board) => board.name === name)?.section !== undefined,
  )
  const held = common ? boards.filter((board) => board.section === common.id).length : 0
  return (
    <aside
      aria-label="Inspector"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-border bg-card p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="m-0 truncate text-base font-semibold">{names.length} boards selected</h2>
        <p className="m-0 text-sm text-muted-foreground">{names.join(', ')}</p>
      </header>
      <section aria-label="Section actions" className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5">
              Section
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-label="Section" className="w-60">
            {common ? null : (
              <DropdownMenuItem
                className="justify-between"
                onSelect={() => onCreateSection(names, false)}
              >
                <span>Create section</span>
                <kbd className="rounded-md border border-border-strong px-1.5 py-px font-sans text-[11px] text-muted-foreground">
                  Shift+S
                </kbd>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!anySection} onSelect={() => onSection(names, null)}>
              Remove from section
            </DropdownMenuItem>
            {common ? (
              <>
                {canNest(common.id, sections) ? (
                  <DropdownMenuItem onSelect={() => onCreateSection(names, true)}>
                    Create sub-section
                  </DropdownMenuItem>
                ) : null}
                <div className="px-2.5 py-1">
                  <ColorRow color={common.color} onPick={(color) => onColor(common.id, color)} />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDeleteSection(common.id)}>
                  Delete section
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="secondary"
          size="sm"
          disabled={!common || !onArrange || held === 0}
          onClick={() => setArranging(true)}
        >
          Arrange...
        </Button>
      </section>
      {common && onArrange ? (
        <ArrangeDialog
          open={arranging}
          onClose={() => setArranging(false)}
          onArrange={(request) => onArrange(common.id, request)}
          initialMode={common.layout ? 'wrap' : 'row'}
          count={held}
          {...(common.layout ? { gap: common.layout.gap } : {})}
        />
      ) : null}
    </aside>
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

/** The selected board: title, approval box, the composer scoped to it, collapsible details and a link to play it full screen. */
export function Inspector({
  board,
  pageId,
  pages,
  placed,
  onFocusBoard,
  children,
}: {
  board: ManifestBoard
  pageId: string
  pages: PageSummary[]
  placed: ReadonlySet<string>
  onFocusBoard: (name: string) => void
  /** The Approval box, shown above the composer. */
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const [details, setDetails] = useState(false)
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
      {children}
      <AgentComposer
        key={board.name}
        page={pageId}
        scope={{ kind: 'board', name: board.name, title: board.title }}
        narrow
      />
      <section aria-label="Details" className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={details}
          onClick={() => setDetails((value) => !value)}
          className="m-0 -mx-2 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-start text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {details ? (
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          Details
        </button>
        {details ? (
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
          </dl>
        ) : null}
      </section>
      <VariantsBox board={board} page={pageId} />
      <Button asChild variant="secondary" size="sm">
        <Link href={playHref(pageId, board.name, 'full')}>
          <Play className="size-3.5 fill-current" />
          Play
        </Link>
      </Button>
    </aside>
  )
}
