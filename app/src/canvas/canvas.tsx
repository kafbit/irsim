'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type ReactNode, Suspense } from 'react'
import { PageCanvas } from './page-canvas'
import type { PageManifest, PageSummary } from './types'
import { type ApiState, useApi } from './use-api'

export const STATUS_TEXT =
  'flex h-screen flex-col items-center justify-center gap-3 text-sm text-muted-foreground'

/** Wraps every route in the LTR chrome shell; the boards inside the frames keep their own direction. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div dir="ltr" lang="en" className="min-h-screen bg-surface text-foreground">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  )
}

/** `/p/<pageId>` is that page's canvas; `?play=canvas|full` plays `?board=`. */
export function PageRoute({ pageId }: { pageId: string }) {
  return (
    <Shell>
      <PageData key={pageId} pageId={pageId} />
    </Shell>
  )
}

function PageData({ pageId }: { pageId: string }) {
  const params = useSearchParams()
  const board = params.get('board')
  const play = params.get('play')
  const manifest = useApi<PageManifest>(`/api/pages/${encodeURIComponent(pageId)}`)
  const pages = useApi<PageSummary[]>('/api/pages')

  if (manifest.status === 'ready') {
    return (
      <PageCanvas
        key={board ?? ''}
        manifest={manifest.data}
        pages={pages.status === 'ready' ? pages.data : []}
        focus={board}
        play={play === 'full' || play === 'canvas' ? play : null}
      />
    )
  }
  return <Status state={manifest} missing={`No page named ${pageId}.`} />
}

export function Status({ state, missing }: { state: ApiState<unknown>; missing: string }) {
  if (state.status === 'loading') return <div className={STATUS_TEXT}>Loading</div>
  if (state.status === 'failed') {
    return <div className={`${STATUS_TEXT} text-destructive`}>Could not load: {state.message}</div>
  }
  return (
    <div className={STATUS_TEXT}>
      <p>{missing}</p>
      <Link href="/" className="underline">
        All pages
      </Link>
    </div>
  )
}
