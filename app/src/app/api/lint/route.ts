import { designDir } from '../../../lib/design-dir'
import { lintDesign } from '../../../lib/lint-design.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The format and layout problems of the design folder, the same list `irsim lint --json` prints. */
export async function GET(): Promise<Response> {
  try {
    return Response.json(lintDesign(designDir()), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
