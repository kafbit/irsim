import { execFile } from 'node:child_process'
import { startedFromCanvas } from '../../../lib/local-request'
import { latestRelease } from '../../../lib/release'
import { RESTART_CODE, exitProcess } from '../../../lib/restart'
import { isUpdating, setUpdating } from '../../../lib/update-state'
import { newer } from '../../../lib/version-info'
import { canUpdate, installedVersion, runningVersion } from '../../../lib/version-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UPDATE_TIMEOUT_MS = 5 * 60 * 1000
const NO_STORE = { 'Cache-Control': 'no-store' }

const runUpdate = (launcher: string): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [launcher, 'update'],
      {
        cwd: process.env.IRSIM_ROOT || process.cwd(),
        timeout: UPDATE_TIMEOUT_MS,
        encoding: 'utf8',
      },
      (error, _stdout, stderr) => {
        if (!error) return resolve(null)
        const last = stderr
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1)
        resolve(last || 'irsim update failed')
      },
    )
  })

const reply = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: NO_STORE })

export async function POST(request: Request): Promise<Response> {
  if (!startedFromCanvas(request)) {
    return reply({ error: 'the update must be started from the canvas' }, 403)
  }
  if (isUpdating()) return reply({ error: 'an update is already running' }, 409)
  setUpdating(true)
  try {
    const before = await installedVersion()
    const launcher = process.env.IRSIM_LAUNCHER
    if (!canUpdate(before) || !launcher || before === null) {
      return reply({ error: 'this server is not a release install, so it cannot update itself' }, 409)
    }
    const release = await latestRelease()
    const needsInstall = release !== null && newer(release.version, before)
    if (!needsInstall && !newer(before, runningVersion())) {
      return reply({ error: 'there is no newer release to install' }, 409)
    }
    if (needsInstall) {
      const failure = await runUpdate(launcher)
      if (failure !== null) return reply({ error: failure }, 500)
    }
    const version = (await installedVersion()) ?? before
    setTimeout(() => exitProcess(RESTART_CODE), 300)
    return reply({ restarting: true, version }, 202)
  } finally {
    setUpdating(false)
  }
}
