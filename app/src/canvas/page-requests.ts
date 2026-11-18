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
