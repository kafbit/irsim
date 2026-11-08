'use client'

import { formatNumber } from '@kafbit/i18n'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Shell, Status } from './canvas'
import { CHROME_FORMAT } from './chrome-format'
import type { PageSummary } from './types'
import { useApi } from './use-api'
import { useLegacyRedirect } from './use-legacy-redirect'

/** `/`: one card per page of the canvas. */
export function PageIndex() {
  return (
    <Shell>
      <Index />
    </Shell>
  )
}

function Index() {
  useLegacyRedirect(useSearchParams().get('board'))
  const pages = useApi<PageSummary[]>('/api/pages')
  if (pages.status !== 'ready') return <Status state={pages} missing="No canvas pages yet." />

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Pages</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
        {pages.data.map((page) => (
          <li key={page.id}>
            <Link
              href={`/p/${encodeURIComponent(page.id)}`}
              className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span dir="auto" className="text-lg font-medium text-foreground">
                {page.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatNumber(page.boardCount, CHROME_FORMAT)}{' '}
                {page.boardCount === 1 ? 'board' : 'boards'}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {page.boards.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
