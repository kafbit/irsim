import { execFile } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { promisify } from 'node:util'
import { designDir } from './design-dir'

const run = promisify(execFile)

/**
 * The branch checked out in this worktree, for the canvas tab title. A detached HEAD gives the
 * short commit and anything git cannot answer gives the worktree folder name, so a title never fails.
 */
export const currentBranch = async (): Promise<string> => {
  const root = dirname(designDir())
  try {
    const { stdout } = await run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])
    const name = stdout.trim()
    if (name && name !== 'HEAD') return name
    const short = await run('git', ['-C', root, 'rev-parse', '--short', 'HEAD'])
    return short.stdout.trim() || basename(root)
  } catch {
    return basename(root)
  }
}
