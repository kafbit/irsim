import { subscribe } from '../../../lib/events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PING_MS = 15_000

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder()
  let stop = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      const unsubscribe = subscribe(({ event, data }) =>
        send(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      )
      const timer = setInterval(() => send(': ping\n\n'), PING_MS)
      stop = () => {
        clearInterval(timer)
        unsubscribe()
        request.signal.removeEventListener('abort', stop)
        try {
          controller.close()
        } catch {}
      }
      request.signal.addEventListener('abort', stop)
      send(': connected\n\n')
    },
    cancel: () => stop(),
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
