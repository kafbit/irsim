import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dataDir } from '../src/lib/data-dir'
import { NO_DESIGN_DIR, designDir, findConfigDir, projectRoot } from '../src/lib/design-dir'
import { thumbsDir } from '../src/lib/thumbs-dir'

const ENV = [
  'IRSIM_DESIGN_DIR',
  'CANVAS_DESIGN_DIR',
  'IRSIM_DATA_DIR',
  'CANVAS_DATA_DIR',
  'IRSIM_THUMBS_DIR',
  'CANVAS_THUMBS_DIR',
] as const

let saved: (string | undefined)[] = []
let argv: string[] = []
let base = ''

beforeEach(() => {
  saved = ENV.map((name) => process.env[name])
  ENV.forEach((name) => delete process.env[name])
  argv = process.argv
  base = realpathSync(mkdtempSync(join(tmpdir(), 'irsim-dir-')))
})

afterEach(() => {
  ENV.forEach((name, at) => {
    const value = saved[at]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  })
  process.argv = argv
  rmSync(base, { recursive: true, force: true })
})

const config = (dir: string, body: unknown): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.irsim.json'), JSON.stringify(body))
}

describe('designDir', () => {
  it('prefers --design-dir over everything else', () => {
    process.argv = [...argv, '--design-dir', 'from-flag']
    process.env.IRSIM_DESIGN_DIR = join(base, 'from-env')
    config(base, { designDir: 'from-file' })
    expect(designDir(base)).toBe(join(base, 'from-flag'))
  })

  it('accepts --design-dir=<path>', () => {
    process.argv = [...argv, `--design-dir=${join(base, 'eq')}`]
    expect(designDir(base)).toBe(join(base, 'eq'))
  })

  it('prefers IRSIM_DESIGN_DIR over .irsim.json', () => {
    process.env.IRSIM_DESIGN_DIR = join(base, 'from-env')
    config(base, { designDir: 'from-file' })
    expect(designDir(base)).toBe(join(base, 'from-env'))
  })

  it('keeps CANVAS_DESIGN_DIR as a fallback and ranks IRSIM_DESIGN_DIR above it', () => {
    process.env.CANVAS_DESIGN_DIR = join(base, 'old')
    expect(designDir(base)).toBe(join(base, 'old'))
    process.env.IRSIM_DESIGN_DIR = join(base, 'new')
    expect(designDir(base)).toBe(join(base, 'new'))
  })

  it('reads designDir from .irsim.json relative to the file, found from a subfolder', () => {
    config(base, { designDir: 'docs/boards' })
    const deep = join(base, 'a/b/c')
    mkdirSync(deep, { recursive: true })
    expect(findConfigDir(deep)).toBe(base)
    expect(designDir(deep)).toBe(join(base, 'docs/boards'))
  })

  it('defaults to design next to .irsim.json when the key is absent', () => {
    config(base, {})
    expect(designDir(join(base))).toBe(join(base, 'design'))
  })

  it('falls back to <cwd>/design when it exists', () => {
    mkdirSync(join(base, 'design'))
    expect(designDir(base)).toBe(join(base, 'design'))
  })

  it('throws the documented message when nothing applies', () => {
    expect(() => designDir(base)).toThrow(NO_DESIGN_DIR)
    expect(NO_DESIGN_DIR).toBe(
      'no design folder found: pass --design-dir, set IRSIM_DESIGN_DIR or add .irsim.json',
    )
  })
})

describe('projectRoot', () => {
  it('is the folder holding .irsim.json', () => {
    config(base, { designDir: 'design' })
    const deep = join(base, 'x/y')
    mkdirSync(deep, { recursive: true })
    expect(projectRoot(deep)).toBe(base)
  })

  it('is the git toplevel without .irsim.json', () => {
    execFileSync('git', ['init', '-q', base])
    const deep = join(base, 'x/y')
    mkdirSync(deep, { recursive: true })
    expect(projectRoot(deep)).toBe(base)
  })

  it('is the cwd outside a repository and without .irsim.json', () => {
    expect(projectRoot(base)).toBe(base)
  })

  it('prefers .irsim.json over the git toplevel', () => {
    execFileSync('git', ['init', '-q', base])
    const inner = join(base, 'packages/site')
    config(inner, {})
    expect(projectRoot(inner)).toBe(inner)
  })
})

describe('dataDir and thumbsDir', () => {
  it('IRSIM_DATA_DIR wins, then CANVAS_DATA_DIR', () => {
    process.env.CANVAS_DATA_DIR = '/old'
    expect(dataDir()).toBe('/old')
    process.env.IRSIM_DATA_DIR = '/new'
    expect(dataDir()).toBe('/new')
  })

  it('defaults to .irsim under the project root', () => {
    expect(dataDir()).toBe(join(projectRoot(), '.irsim'))
  })

  it('IRSIM_THUMBS_DIR wins, then CANVAS_THUMBS_DIR, else ~/.cache/irsim/thumbs', () => {
    process.env.CANVAS_THUMBS_DIR = '/old'
    expect(thumbsDir()).toBe('/old')
    process.env.IRSIM_THUMBS_DIR = '/new'
    expect(thumbsDir()).toBe('/new')
    delete process.env.IRSIM_THUMBS_DIR
    delete process.env.CANVAS_THUMBS_DIR
    expect(thumbsDir()).toMatch(/irsim\/thumbs$/)
  })
})
