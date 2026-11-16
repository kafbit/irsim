'use client'

import type { PickedElement } from './types'
import { useSession } from './use-session'

/** Sends a free-form variants request for the picked element's board to the chosen live session. */
export function useGenerate({
  page,
  pick,
  onSent,
}: {
  page: string
  pick: PickedElement
  onSent: (count: number) => void
}) {
  const { sessions, sessionId, loaded, pick: pickSession } = useSession()
  const generate = async (note: string, count: number, images: string[] = []) => {
    if (!sessionId) throw new Error('No agent session. Run /irsim in your coding agent.')
    const response = await fetch('/api/variants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        page,
        board: pick.board,
        count,
        note,
        ...(images.length > 0 ? { images } : {}),
        pick: { file: pick.file, line: pick.line, element: pick.element },
        sessionId,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { boards?: unknown[]; error?: string }
    if (response.status !== 201) throw new Error(body.error ?? `HTTP ${response.status}`)
    onSent(body.boards?.length ?? count)
  }
  return {
    canGenerate: !loaded || Boolean(sessionId),
    generate,
    session: { sessions, loaded, sessionId, onPick: pickSession },
  }
}
