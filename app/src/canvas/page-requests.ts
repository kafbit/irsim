export const sendPageRequest = async (input: {
  page: string
  kind: 'reorganize' | 'icon'
  sessionId: string
}): Promise<void> => {
  const response = await fetch('/api/page-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.ok) return
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  throw new Error(typeof body?.error === 'string' ? body.error : 'Could not send the request.')
}

export type AskScope =
  | { scope: 'page' }
  | { scope: 'board'; board: string }
  | { scope: 'boards'; boards: string[] }
  | { scope: 'section'; section: string }

export const sendAsk = async (
  input: { sessionId: string; page: string; prompt: string; images?: string[] } & AskScope,
): Promise<void> => {
  const response = await fetch('/api/page-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, kind: 'ask' }),
  })
  if (response.ok) return
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  throw new Error(typeof body?.error === 'string' ? body.error : 'Could not send the request.')
}
