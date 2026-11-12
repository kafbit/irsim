export type VersionInfo = {
  running: string
  installed: string | null
  latest: string | null
  releaseUrl: string | null
  canUpdate: boolean
}

export type Notice = { kind: 'available' | 'restart'; version: string; releaseUrl: string | null }

const split = (version: string): { core: number[]; pre: string[] } => {
  const [withoutBuild = ''] = version.split('+')
  const dash = withoutBuild.indexOf('-')
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1)
  return {
    core: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre === '' ? [] : pre.split('.'),
  }
}

const isNumeric = (identifier: string): boolean => /^\d+$/.test(identifier)

const compareIdentifier = (a: string, b: string): number => {
  const [x, y] = [isNumeric(a), isNumeric(b)]
  if (x && y) return Math.sign(Number(a) - Number(b))
  if (x) return -1
  if (y) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

const compare = (a: string, b: string): number => {
  const [x, y] = [split(a), split(b)]
  for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
    const difference = (x.core[i] ?? 0) - (y.core[i] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  if (x.pre.length === 0 || y.pre.length === 0) return Math.sign(y.pre.length - x.pre.length)
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const result = compareIdentifier(x.pre[i] as string, y.pre[i] as string)
    if (result !== 0) return result
  }
  return Math.sign(x.pre.length - y.pre.length)
}

export const newer = (a: string, b: string): boolean => compare(a, b) > 0

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
