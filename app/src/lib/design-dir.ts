import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const CONFIG_FILE = '.irsim.json'
export const NO_DESIGN_DIR = `no design folder found: pass --design-dir, set IRSIM_DESIGN_DIR or add ${CONFIG_FILE}`

/** The first folder at or above `from` that holds `.irsim.json`, or null. */
export const findConfigDir = (from: string = process.cwd()): string | null => {
  let dir = resolve(from)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const argValue = (name: string): string | undefined => {
  const args = process.argv
  const at = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (at === -1) return undefined
  const arg = args[at] ?? ''
  return arg.includes('=') ? arg.slice(name.length + 1) : args[at + 1]
}

const configuredDesignDir = (dir: string): string => {
  const parsed: unknown = JSON.parse(readFileSync(join(dir, CONFIG_FILE), 'utf8'))
  const value = (parsed as { designDir?: unknown } | null)?.designDir
  return resolve(dir, typeof value === 'string' && value ? value : 'design')
}

/**
 * Resolves the folder of `*.html` boards (and legacy `*.dc.html`): `--design-dir` argv, `IRSIM_DESIGN_DIR` (or the legacy
 * `CANVAS_DESIGN_DIR`), the `designDir` of the nearest `.irsim.json` above `cwd`, then `<cwd>/design`.
 * Throws `NO_DESIGN_DIR` when none applies, and the JSON error when `.irsim.json` is malformed.
 */
export const designDir = (cwd: string = process.cwd()): string => {
  const flag = argValue('--design-dir')
  if (flag) return resolve(cwd, flag)
  const override = process.env.IRSIM_DESIGN_DIR || process.env.CANVAS_DESIGN_DIR
  if (override) return resolve(cwd, override)
  const configDir = findConfigDir(cwd)
  if (configDir) return configuredDesignDir(configDir)
  const fallback = join(resolve(cwd), 'design')
  if (existsSync(fallback)) return fallback
  throw new Error(NO_DESIGN_DIR)
}

const gitToplevel = (cwd: string): string | null => {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return top || null
  } catch {
    return null
  }
}

/**
 * `IRSIM_ROOT` when set (the launcher sets it, because the standalone server changes its cwd to the
 * install folder), else the folder holding `.irsim.json` above `cwd`, else the git toplevel of
 * `cwd`, else `cwd`.
 */
export const projectRoot = (cwd: string = process.cwd()): string =>
  process.env.IRSIM_ROOT || (findConfigDir(cwd) ?? gitToplevel(resolve(cwd)) ?? resolve(cwd))

export const designFolderName = (): string => {
  try {
    return basename(designDir())
  } catch {
    return 'design'
  }
}
