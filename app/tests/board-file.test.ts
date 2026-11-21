import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  boardFileName,
  boardNameOf,
  BOARD_SUFFIX,
  isBoardSource,
  LEGACY_SUFFIX,
  listBoards,
} from '../src/lib/board-file.mjs'

const BOARD = '<x-dc><div>board</div></x-dc>'

describe('suffixes and names', () => {
  it('exposes both suffixes', () => {
    expect(BOARD_SUFFIX).toBe('.html')
    expect(LEGACY_SUFFIX).toBe('.dc.html')
  })

  it('strips either suffix and leaves a bare name', () => {
    expect(boardNameOf('Leads.html')).toBe('Leads')
    expect(boardNameOf('Leads.dc.html')).toBe('Leads')
    expect(boardNameOf('Leads')).toBe('Leads')
  })

  it('recognises the board marker', () => {
    expect(isBoardSource('<x-dc>a</x-dc>')).toBe(true)
    expect(isBoardSource('<script type="text/x-dc" data-props="{}"></script>')).toBe(true)
    expect(isBoardSource('<html><body>plain page</body></html>')).toBe(false)
  })
})

describe('board files on disk', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'board-file-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('finds a file with only the new suffix', () => {
    writeFileSync(join(dir, 'A.html'), BOARD)
    expect(boardFileName(dir, 'A')).toBe('A.html')
  })

  it('finds a file with only the legacy suffix', () => {
    writeFileSync(join(dir, 'A.dc.html'), BOARD)
    expect(boardFileName(dir, 'A')).toBe('A.dc.html')
  })

  it('prefers the new suffix when both exist', () => {
    writeFileSync(join(dir, 'A.html'), BOARD)
    writeFileSync(join(dir, 'A.dc.html'), BOARD)
    expect(boardFileName(dir, 'A')).toBe('A.html')
  })

  it('uses the legacy file when the new name holds a page that is not a board', () => {
    writeFileSync(join(dir, 'A.html'), '<html><body>plain page</body></html>')
    writeFileSync(join(dir, 'A.dc.html'), BOARD)
    expect(boardFileName(dir, 'A')).toBe('A.dc.html')
  })

  it('keeps the new name when it is not a board and no legacy file exists', () => {
    writeFileSync(join(dir, 'A.html'), '<html><body>plain page</body></html>')
    expect(boardFileName(dir, 'A')).toBe('A.html')
  })

  it('returns null for no file and for a bad name', () => {
    expect(boardFileName(dir, 'A')).toBeNull()
    writeFileSync(join(dir, 'a-b.html'), BOARD)
    expect(boardFileName(dir, 'a-b')).toBeNull()
    expect(boardFileName(dir, '../A')).toBeNull()
  })

  it('lists a mixed folder sorted, once per name', () => {
    writeFileSync(join(dir, 'Zed.html'), BOARD)
    writeFileSync(join(dir, 'Old.dc.html'), BOARD)
    writeFileSync(join(dir, 'Both.html'), BOARD)
    writeFileSync(join(dir, 'Both.dc.html'), BOARD)
    writeFileSync(join(dir, 'Notes.html'), '<html><body>not a board</body></html>')
    writeFileSync(join(dir, 'canvas.json'), '{}')
    expect(listBoards(dir)).toEqual([
      { name: 'Both', file: 'Both.html', legacy: false },
      { name: 'Old', file: 'Old.dc.html', legacy: true },
      { name: 'Zed', file: 'Zed.html', legacy: false },
    ])
  })

  it('lists nothing for a missing folder', () => {
    mkdirSync(join(dir, 'x'))
    expect(listBoards(join(dir, 'missing'))).toEqual([])
  })
})

describe('the two copies of the helper', () => {
  it('are byte-equal', () => {
    const bin = readFileSync(join(import.meta.dirname, '../../bin/lib/board-file.mjs'))
    const app = readFileSync(join(import.meta.dirname, '../src/lib/board-file.mjs'))
    expect(app.equals(bin)).toBe(true)
  })
})
