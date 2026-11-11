import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { currentBranch } from '../src/lib/branch'

const roots: string[] = []

const repo = (branch: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'canvas-branch-'))
  roots.push(root)
  mkdirSync(join(root, 'design'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q', '-b', branch)
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  process.env.IRSIM_DESIGN_DIR = join(root, 'design')
  return root
}

afterEach(() => {
  delete process.env.IRSIM_DESIGN_DIR
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('currentBranch', () => {
  it('names the branch checked out in the worktree', async () => {
    repo('more-tables-refinements')
    expect(await currentBranch()).toBe('more-tables-refinements')
  })

  it('gives the short commit on a detached HEAD', async () => {
    const root = repo('main')
    execFileSync('git', ['-C', root, 'checkout', '-q', '--detach'])
    expect(await currentBranch()).toMatch(/^[0-9a-f]{7,}$/)
  })

  it('falls back to the folder name outside a git repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-nogit-'))
    roots.push(root)
    mkdirSync(join(root, 'design'))
    process.env.IRSIM_DESIGN_DIR = join(root, 'design')
    expect(await currentBranch()).toBe(basename(root))
  })
})
