import { api, baseUrl, listenKey } from './api'
import type { Claim, Engine } from './api'

const POLL_MS = 2000
const statusLine = (url: string): string =>
  url ? `canvas ${url} · listening` : 'canvas · listening'

let timer: { cancel: () => void } | null = null
let isPolling = false

export async function syncPoll($: Engine): Promise<void> {
  const sessionId = await $.session.id()
  const isOn = Boolean(await $.store.get(listenKey(sessionId)))
  if (isOn && !timer) {
    timer = $.clock.every(POLL_MS, () => poll($))
    const url = await baseUrl($).catch(() => '')
    if (timer) $.ui.status(statusLine(url))
  } else if (!isOn && timer) {
    timer.cancel()
    timer = null
    $.ui.status(undefined)
  }
}

async function poll($: Engine): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    const sessionId = await $.session.id()
    if (!(await $.store.get(listenKey(sessionId)))) return await syncPoll($)
    const claim = await api<Claim>($, '/api/comments/claim', {
      method: 'POST',
      body: { sessionId },
    })
    if (claim.count > 0 && claim.text)
      void $.prompt.submit({ text: claim.text }).catch(() => undefined)
  } catch {
    return
  } finally {
    isPolling = false
  }
}

export function stopPolling($: Engine): void {
  timer?.cancel()
  timer = null
  $.ui.status(undefined)
}
