import { readUpdateProgress } from '../../../../lib/update-progress'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return Response.json(await readUpdateProgress(process.env.IRSIM_PREFIX), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
