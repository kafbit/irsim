import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowser } from '../src/lib/browser-path'

let root: string

const fake = (path: string, mode = 0o755): string => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '#!/bin/sh\n')
  chmodSync(path, mode)
  return path
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'irsim-browser-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('findBrowser', () => {
  it('prefers IRSIM_BROWSER over PATH', () => {
    const bin = join(root, 'a', 'bin')
    fake(join(bin, 'google-chrome'))
    const own = fake(join(root, 'a', 'custom', 'my-browser'))
    expect(findBrowser({ IRSIM_BROWSER: own, PATH: bin }, 'linux')).toBe(own)
  })

  it('returns undefined when IRSIM_BROWSER is not an executable file', () => {
    const bin = join(root, 'b', 'bin')
    fake(join(bin, 'google-chrome'))
    const plain = fake(join(root, 'b', 'plain'), 0o644)
    expect(findBrowser({ IRSIM_BROWSER: join(root, 'b', 'missing'), PATH: bin }, 'linux')).toBeUndefined()
    expect(findBrowser({ IRSIM_BROWSER: plain, PATH: bin }, 'linux')).toBeUndefined()
  })

  it('follows the name order inside one PATH directory', () => {
    const bin = join(root, 'c', 'bin')
    fake(join(bin, 'brave'))
    const chrome = fake(join(bin, 'google-chrome'))
    expect(findBrowser({ PATH: bin }, 'linux')).toBe(chrome)
  })

  it('follows the PATH directory order', () => {
    const first = join(root, 'd', 'first')
    const second = join(root, 'd', 'second')
    const brave = fake(join(first, 'brave'))
    fake(join(second, 'google-chrome'))
    expect(findBrowser({ PATH: `${first}:${second}` }, 'linux')).toBe(brave)
  })

  it('skips files that are not executable', () => {
    const bin = join(root, 'e', 'bin')
    fake(join(bin, 'google-chrome'), 0o644)
    const edge = fake(join(bin, 'microsoft-edge'))
    expect(findBrowser({ PATH: bin }, 'linux')).toBe(edge)
  })

  it('returns undefined when nothing is found', () => {
    const empty = join(root, 'f', 'bin')
    mkdirSync(empty, { recursive: true })
    expect(findBrowser({ PATH: empty, HOME: join(root, 'f') }, 'linux')).toBeUndefined()
    expect(findBrowser({}, 'linux')).toBeUndefined()
  })

  it('finds a browser in ~/Applications on darwin when PATH has none', () => {
    const home = join(root, 'g')
    const app = fake(join(home, 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'))
    expect(findBrowser({ PATH: join(root, 'g', 'empty'), HOME: home }, 'darwin')).toBe(app)
  })

  it('ignores the macOS application folders on other platforms', () => {
    const home = join(root, 'h')
    fake(join(home, 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    expect(findBrowser({ PATH: '', HOME: home }, 'linux')).toBeUndefined()
  })
})
