const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const hostnameOf = (host: string): string | null => {
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return null
  }
}

export const startedFromCanvas = (request: Request): boolean => {
  const host = request.headers.get('host') ?? new URL(request.url).host
  const hostname = hostnameOf(host)
  if (hostname === null || !LOCAL_HOSTS.has(hostname)) return false
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (origin === null) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
