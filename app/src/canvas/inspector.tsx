'use client'

import { Button, IconButton } from '../ui'
import { Check, CopyIcon } from '../ui/icons'
import Link from 'next/link'
import { useState } from 'react'
import type { ManifestBoard, PageSummary } from './types'

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

/** The selected board: name, title, size, file path with copy, the boards it imports, and a link to open it alone. */
export function Inspector({
  board,
  pageId,
  pages,
  placed,
  onFocusBoard,
}: {
  board: ManifestBoard
  pageId: string
  pages: PageSummary[]
  placed: ReadonlySet<string>
  onFocusBoard: (name: string) => void
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
            <ul className="m-0 -mx-2 flex list-none flex-col p-0">
              {imports.map((name) => {
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
          )}
        </Row>
      </dl>
      <Button asChild variant="secondary" size="sm">
        <Link
          href={`/p/${encodeURIComponent(pageId)}?board=${encodeURIComponent(board.name)}&alone=1`}
        >
          Open alone
        </Link>
      </Button>
    </aside>
  )
}
