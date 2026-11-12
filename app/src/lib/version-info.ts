export type VersionInfo = {
  running: string
  installed: string | null
  latest: string | null
  releaseUrl: string | null
  canUpdate: boolean
}

export type Notice = { kind: 'available' | 'restart'; version: string; releaseUrl: string | null }

export const newer = (a: string, b: string): boolean => {
  const parts = (version: string) =>
    version.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

export const noticeOf = (info: VersionInfo): Notice | null => {
  if (!info.canUpdate || info.installed === null) return null
  if (info.latest !== null && newer(info.latest, info.installed)) {
    return { kind: 'available', version: info.latest, releaseUrl: info.releaseUrl }
  }
  if (newer(info.installed, info.running)) {
    return { kind: 'restart', version: info.installed, releaseUrl: null }
  }
  return null
}
