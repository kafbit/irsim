import { accessSync, constants, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PATH_NAMES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'brave',
  'brave-browser',
  'microsoft-edge',
  'microsoft-edge-stable',
]

const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const isExecutable = (path: string): boolean => {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Finds an installed Chromium-family browser: IRSIM_BROWSER, then Chrome, Chromium, Brave and Edge
 * on PATH, then the macOS application folders. A set IRSIM_BROWSER that is not an executable file
 * yields undefined, so a wrong path is never silently replaced by another browser.
 */
export const findBrowser = (
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): string | undefined => {
  const chosen = env.IRSIM_BROWSER
  if (chosen) return isExecutable(chosen) ? chosen : undefined
  for (const dir of (env.PATH ?? '').split(':')) {
    if (!dir) continue
    for (const name of PATH_NAMES) {
      const candidate = join(dir, name)
      if (isExecutable(candidate)) return candidate
    }
  }
  if (platform === 'darwin') {
    const roots = ['/Applications', join(env.HOME || homedir(), 'Applications')]
    for (const root of roots) {
      for (const app of MAC_APPS) {
        const candidate = join(root, app)
        if (isExecutable(candidate)) return candidate
      }
    }
  }
  return undefined
}
