'use client'

import { formatNumber } from '../lib/format-number'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { Shell, Status } from './canvas'
import { CHROME_FORMAT } from './chrome-format'
import type { PageSummary } from './types'
import { GlobalSearch } from './global-search'
import { SettingsDialog } from './settings-dialog'
import { UpdateNotice } from './update-notice'
import { useApi } from './use-api'
import { useLegacyRedirect } from './use-legacy-redirect'

/** `/`: one card per page of the canvas. */
export function PageIndex() {
  const [settings, setSettings] = useState(false)
  return (
    <Shell>
      <Index onOpenSettings={() => setSettings(true)} />
      <IndexSearch onOpenSettings={() => setSettings(true)} />
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </Shell>
  )
}

function IndexSearch({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return <GlobalSearch open={open} onOpenChange={setOpen} onOpenSettings={onOpenSettings} />
}

function Index({ onOpenSettings }: { onOpenSettings: () => void }) {
  useLegacyRedirect(useSearchParams().get('board'))
  const pages = useApi<PageSummary[]>('/api/pages')
  if (pages.status !== 'ready') return <Status state={pages} missing="No canvas pages yet." />

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="m-0 flex-1 text-2xl font-semibold">Pages</h1>
        <Button variant="secondary" size="sm" onClick={onOpenSettings} className="h-8.5 px-3 text-[13px]">
          Settings
        </Button>
      </div>
      <UpdateNotice className="mb-6 max-w-sm" />
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
