'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  SearchDialog,
  type SearchAction,
  type SearchBoard,
  type SearchData,
  type SearchPage,
  type SearchSection,
} from './search-dialog'
import { useTheme } from './use-theme'
import { playHref } from './use-play-links'

export type GlobalSearchProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId?: string
  onSelectBoards?: (names: string[]) => void
  onOpenSettings?: () => void
}

const boardHref = (page: string, board: string) =>
  `/p/${encodeURIComponent(page)}?board=${encodeURIComponent(board)}`

async function membersOf(section: SearchSection): Promise<string[]> {
  const response = await fetch('/api/search', { cache: 'no-store' })
  if (!response.ok) return []
  const data = (await response.json()) as SearchData
  return data.boards
    .filter((board) => board.page === section.page && board.section === section.id)
    .map((board) => board.name)
}

export function GlobalSearch({ open, onOpenChange, pageId, onSelectBoards, onOpenSettings }: GlobalSearchProps) {
  const router = useRouter()
  const { toggle } = useTheme()

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown } | null
      if (data?.type === 'search-chord') onOpenChange(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onOpenChange])

  const actions: SearchAction[] = [
    { id: 'pages', label: 'All pages', hint: 'Go to the page index', run: () => router.push('/') },
    { id: 'toggle-theme', label: 'Toggle theme', hint: 'Light or dark', run: toggle },
    ...(onOpenSettings
      ? [{ id: 'settings', label: 'Settings', hint: 'Version, project and health', run: onOpenSettings }]
      : []),
  ]

  const onOpenBoard = (board: SearchBoard, options?: { play?: boolean }) => {
    if (options?.play) router.push(playHref(board.page, board.name, 'full'))
    else if (board.page === pageId && onSelectBoards) onSelectBoards([board.name])
    else router.push(boardHref(board.page, board.name))
  }

  const onOpenSection = (section: SearchSection) => {
    void membersOf(section)
      .then((names) => {
        if (section.page === pageId && onSelectBoards && names.length > 0) onSelectBoards(names)
        else if (names[0]) router.push(boardHref(section.page, names[0]))
        else router.push(`/p/${encodeURIComponent(section.page)}`)
      })
      .catch(() => router.push(`/p/${encodeURIComponent(section.page)}`))
  }

  const onOpenPage = (page: SearchPage) => router.push(`/p/${encodeURIComponent(page.id)}`)

  return (
    <SearchDialog
      open={open}
      onOpenChange={onOpenChange}
      pageId={pageId ?? ''}
      actions={actions}
      onOpenBoard={onOpenBoard}
      onOpenSection={onOpenSection}
      onOpenPage={onOpenPage}
    />
  )
}
