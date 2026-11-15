'use client'

import { Button, IconButton, Select } from '../ui'
import { Check, ChevronDown, CopyIcon, Play } from '../ui/icons'
import Link from 'next/link'
import { useState } from 'react'
import { sharedSection } from './sections'
import type { CanvasSection, ManifestBoard, PageSummary } from './types'
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

/** Several boards selected: the count, their names, the shared Section field and the section actions. */
export function InspectorMulti({
  names,
  boards,
  sections,
  onSection,
  onCreateSection,
  onDeleteSection,
}: {
  names: string[]
  boards: { name: string; title: string; section?: string | undefined }[]
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
  onCreateSection: (names: string[]) => void
  onDeleteSection: (id: string) => void
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
        <Button size="sm" className="justify-between" onClick={() => onCreateSection(names)}>
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
          <Button variant="secondary" size="sm" onClick={() => onDeleteSection(common.id)}>
            Delete section
          </Button>
        ) : null}
      </section>
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

/** The selected board: name, title, size, file path with copy, the boards it imports, and a link to play it full screen. */
export function Inspector({
  board,
  pageId,
  pages,
  placed,
  sections,
  onSection,
  onFocusBoard,
  children,
}: {
  board: ManifestBoard
  pageId: string
  pages: PageSummary[]
  placed: ReadonlySet<string>
  sections: CanvasSection[]
  onSection: (names: string[], id: string | null) => void
  onFocusBoard: (name: string) => void
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
      <VariantsBox board={board} page={pageId} />
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
