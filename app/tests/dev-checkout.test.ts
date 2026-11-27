import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkoutHead,
  clearDevCache,
  depsStale,
  installDeps,
  lastHeadMove,
  rewritesFiles,
  watchCheckout,
} from '../../bin/lib/dev-checkout.mjs'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'irsim-dev-checkout-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const git = (...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    stdio: 'ignore',
  })

describe('checkoutHead and lastHeadMove', () => {
  it('return null and an empty move outside a git checkout', () => {
    expect(checkoutHead(dir)).toBeNull()
    expect(lastHeadMove(dir)).toBe('')
  })

  it('read the commit and the last HEAD move of a checkout', () => {
    git('init', '-q', '-b', 'master')
    writeFileSync(join(dir, 'a'), '1')
    git('add', 'a')
    git('commit', '-q', '-m', 'first')
    expect(checkoutHead(dir)).toMatch(/^[0-9a-f]{40}$/)
    expect(lastHeadMove(dir)).toBe('commit (initial): first')
    git('checkout', '-q', '-b', 'other')
    expect(lastHeadMove(dir)).toBe('checkout: moving from master to other')
  })
})

describe('rewritesFiles', () => {
  it('skips a new commit and restarts for every move that rewrites files', () => {
    expect(rewritesFiles('commit: fix the thing')).toBe(false)
    expect(rewritesFiles('commit (initial): first')).toBe(false)
    expect(rewritesFiles('commit (amend): fix')).toBe(false)
    expect(rewritesFiles('pull: Fast-forward')).toBe(true)
    expect(rewritesFiles('checkout: moving from main to main')).toBe(true)
    expect(rewritesFiles('reset: moving to origin/main')).toBe(true)
    expect(rewritesFiles('rebase (finish): returning to refs/heads/main')).toBe(true)
    expect(rewritesFiles('merge origin/main: Fast-forward')).toBe(true)
    expect(rewritesFiles('commit (merge): Merge branch x')).toBe(true)
    expect(rewritesFiles('')).toBe(true)
  })
})

describe('clearDevCache', () => {
  it('removes .next/dev only and reports whether there was one', () => {
    mkdirSync(join(dir, '.next', 'dev', 'cache'), { recursive: true })
    writeFileSync(join(dir, '.next', 'BUILD_ID'), 'x')
    expect(clearDevCache(dir)).toBe(true)
    expect(existsSync(join(dir, '.next', 'dev'))).toBe(false)
    expect(existsSync(join(dir, '.next', 'BUILD_ID'))).toBe(true)
    expect(clearDevCache(dir)).toBe(false)
  })
})

describe('depsStale and installDeps', () => {
  it('is stale when bun.lock is newer than node_modules or node_modules is missing', () => {
    expect(depsStale(dir)).toBe(false)
    writeFileSync(join(dir, 'bun.lock'), '{}')
    expect(depsStale(dir)).toBe(true)
    mkdirSync(join(dir, 'node_modules'))
    utimesSync(join(dir, 'bun.lock'), new Date(1000), new Date(1000))
    expect(depsStale(dir)).toBe(false)
    utimesSync(join(dir, 'bun.lock'), new Date(), new Date(Date.now() + 60_000))
    expect(depsStale(dir)).toBe(true)
  })

  it('runs bun install in the app and touches node_modules on success', () => {
    writeFileSync(join(dir, 'bun.lock'), '{}')
    mkdirSync(join(dir, 'node_modules'))
    utimesSync(join(dir, 'bun.lock'), new Date(2000), new Date(2000))
    utimesSync(join(dir, 'node_modules'), new Date(1000), new Date(1000))
    expect(depsStale(dir)).toBe(true)
    const calls: unknown[][] = []
    const ok = installDeps(dir, ((...call: unknown[]) => {
      calls.push(call)
      return { status: 0 }
    }) as never)
    expect(ok).toBe(true)
    expect(calls[0]?.slice(0, 2)).toEqual(['bun', ['install']])
    expect(depsStale(dir)).toBe(false)
  })

  it('reports a failed or missing bun', () => {
    expect(installDeps(dir, (() => ({ status: 1 })) as never)).toBe(false)
    expect(installDeps(dir, (() => ({ error: new Error('ENOENT'), status: null })) as never)).toBe(false)
  })
})

describe('watchCheckout', () => {
  const setup = (heads: (string | null)[], move = 'pull: Fast-forward') => {
    let tick: () => void = () => {}
    let i = 0
    const moves: string[] = []
    const stop = watchCheckout('/x', (head: string) => moves.push(head), {
      head: () => heads[Math.min(i++, heads.length - 1)] ?? null,
      move: () => move,
      setIntervalFn: ((fn: () => void) => {
        tick = fn
        return {}
      }) as never,
      clearIntervalFn: () => {},
    })
    return { tick: () => tick(), moves, stop }
  }

  it('reports a new head once it is the same on two polls in a row', () => {
    const w = setup(['a', 'a', 'b', 'b', 'b', 'b'])
    w.tick()
    expect(w.moves).toEqual([])
    w.tick()
    expect(w.moves).toEqual([])
    w.tick()
    expect(w.moves).toEqual(['b'])
    w.tick()
    w.tick()
    expect(w.moves).toEqual(['b'])
  })

  it('waits while the head still moves and ignores a missing head', () => {
    const w = setup(['a', 'b', 'c', null, 'c', 'c'])
    for (let n = 0; n < 5; n++) w.tick()
    expect(w.moves).toEqual(['c'])
  })

  it('does not report a plain commit', () => {
    const w = setup(['a', 'b', 'b'], 'commit: work')
    w.tick()
    w.tick()
    expect(w.moves).toEqual([])
  })
})
