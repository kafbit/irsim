import { latestRelease } from '../../../lib/release'
import type { VersionInfo } from '../../../lib/version-info'
import { canUpdate, installedVersion, runningVersion } from '../../../lib/version-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request?: Request): Promise<Response> {
  const skipLatest = request ? new URL(request.url).searchParams.get('latest') === '0' : false
  const installed = await installedVersion()
  const release = installed === null || skipLatest ? null : await latestRelease()
  const info: VersionInfo = {
    running: runningVersion(),
    installed,
    latest: release?.version ?? null,
    releaseUrl: release?.url ?? null,
    canUpdate: canUpdate(installed),
  }
  return Response.json(info, { headers: { 'Cache-Control': 'no-store' } })
}
