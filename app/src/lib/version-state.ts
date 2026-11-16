import { realpath } from 'node:fs/promises'
import { basename, join } from 'node:path'
import packageJson from '../../package.json'

export const runningVersion = (): string => process.env.IRSIM_VERSION || packageJson.version

export const installedVersion = async (): Promise<string | null> => {
  const prefix = process.env.IRSIM_PREFIX
  if (!prefix) return null
  try {
    return basename(await realpath(join(prefix, 'current'))).replace(/-local$/, '')
  } catch {
    return null
  }
}

export const canUpdate = (installed: string | null): boolean =>
  installed !== null && Boolean(process.env.IRSIM_LAUNCHER)
