import { execFile } from 'node:child_process'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TIMEOUT_MS = 30_000
const NO_STORE = { 'Cache-Control': 'no-store' }

const reply = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: NO_STORE })

/**
 * Runs `irsim doctor --json` through the launcher in the project root, the way `/api/update` runs
 * `irsim update`. The launcher owns the checks, so the canvas and the terminal agree.
 */
export async function GET(): Promise<Response> {
  const launcher = process.env.IRSIM_LAUNCHER
  if (!launcher) {
    return reply(
      { error: 'this server was not started by irsim, so it cannot run the doctor. Start it with irsim serve.' },
      409,
    )
  }
  const root = process.env.IRSIM_ROOT || process.cwd()
  return new Promise<Response>((done) => {
    execFile(
      process.execPath,
      [launcher, 'doctor', '--json'],
      { cwd: root, timeout: TIMEOUT_MS, encoding: 'utf8', env: { ...process.env, IRSIM_ROOT: root } },
      (error, stdout, stderr) => {
        if (stdout) {
          try {
            return done(reply(JSON.parse(stdout), 200))
          } catch {}
        }
        const last = stderr
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1)
        done(reply({ error: last ?? error?.message ?? 'irsim doctor failed' }, 500))
      },
    )
  })
}
