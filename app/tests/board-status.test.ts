import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { baselineOf, statusOf } from '../src/lib/board-status'
import { buildApprovalText } from '../src/lib/turn-text'

describe('statusOf', () => {
  it('is new without a baseline or an approval', () => {
    expect(statusOf({ hash: 'a', baseline: undefined, approvalHash: undefined })).toBe('new')
  })
  it('is none while the board matches its baseline', () => {
    expect(statusOf({ hash: 'a', baseline: 'a', approvalHash: undefined })).toBe('none')
  })
  it('is changed when it differs from the baseline', () => {
    expect(statusOf({ hash: 'b', baseline: 'a', approvalHash: undefined })).toBe('changed')
  })
  it('follows the approval over the baseline', () => {
    expect(statusOf({ hash: 'b', baseline: 'a', approvalHash: 'b' })).toBe('approved')
    expect(statusOf({ hash: 'c', baseline: 'a', approvalHash: 'b' })).toBe('changed')
  })
  it('keeps a new board approved', () => {
    expect(statusOf({ hash: 'a', baseline: undefined, approvalHash: 'a' })).toBe('approved')
  })
})

describe('baselineOf', () => {
  let dir = ''
  const before = process.env.IRSIM_DATA_DIR
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'irsim-baseline-'))
    process.env.IRSIM_DATA_DIR = dir
  })
  afterEach(async () => {
    if (before === undefined) delete process.env.IRSIM_DATA_DIR
    else process.env.IRSIM_DATA_DIR = before
    await rm(dir, { recursive: true, force: true })
  })

  it('records every board the first time a page is seen and keeps it after', async () => {
    expect(await baselineOf('p', { A: '1' })).toEqual({ A: '1' })
    expect(await baselineOf('p', { A: '2', B: '3' })).toEqual({ A: '1' })
    expect(JSON.parse(await readFile(join(dir, 'baseline.json'), 'utf8'))).toEqual({ p: { A: '1' } })
  })
})

describe('buildApprovalText for a batch', () => {
  const approval = (id: string, board: string) => ({
    id,
    page: 'p',
    board,
    hash: 'h',
    note: '',
    sessionId: 's',
    batch: 'b_1',
    status: 'queued' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  it('is one turn that lists the boards', () => {
    const text = buildApprovalText([approval('a_1', 'A'), approval('a_2', 'B')], { a_1: true, a_2: true })
    expect(text.split('\n').filter((line) => line.startsWith('Design canvas:'))).toHaveLength(1)
    expect(text).toContain('A, B')
    expect(text).toContain('design/A.dc.html, design/B.dc.html')
  })
  it('names a board that changed after the approval', () => {
    const text = buildApprovalText([approval('a_1', 'A'), approval('a_2', 'B')], { a_1: true, a_2: false })
    expect(text).toContain('B changed after the approval')
  })
})
