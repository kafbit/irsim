import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAVICON } from '../../bin/lib/export-site.mjs'

const PREFIX = 'data:image/svg+xml,'

describe('export favicon', () => {
  it('matches app/src/app/icon.svg', () => {
    const icon = readFileSync(join(__dirname, '../src/app/icon.svg'), 'utf8')
      .replace(/>\s+</g, '><')
      .trim()
    expect((FAVICON as string).startsWith(PREFIX)).toBe(true)
    expect(decodeURIComponent((FAVICON as string).slice(PREFIX.length))).toBe(icon)
    expect(FAVICON).not.toContain('"')
  })
})
