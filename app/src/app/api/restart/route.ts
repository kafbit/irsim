import { startedFromCanvas } from '../../../lib/local-request'
import { RESTART_CODE, exitProcess } from '../../../lib/restart'
import { installedBuild, installedVersion } from '../../../lib/version-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const reply = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  if (!startedFromCanvas(request)) {
    return reply({ error: 'the restart must be started from the canvas' }, 403)
  }
  if (!process.env.IRSIM_LAUNCHER || !process.env.IRSIM_PREFIX) {
    return reply(
      { error: 'this server was not started by irsim serve, so it cannot restart itself' },
      409,
    )
  }
  setTimeout(() => exitProcess(RESTART_CODE), 300)
  return reply(
    { restarting: true, build: await installedBuild(), version: await installedVersion() },
    202,
  )
}
