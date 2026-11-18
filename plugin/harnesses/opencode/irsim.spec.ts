import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import plugin from './irsim.js'

const SESSION = 'ses_1'
const CLAIM = {
  count: 2,
  text: 'Design canvas: 2 comments on page sales.',
  comments: [{ id: 'c_1', newReplies: [{ at: '2026-11-08T10:00:00.000Z' }] }],
  approvals: [{ id: 'a_1' }],
}

type Command = { name: string; execute: (input: { sessionID: string; prompt?: { text: string } }) => Promise<void> }

describe('opencode irsim plugin', () => {
  let dir: string
  let log: string
  let ticks: (() => Promise<void> | void)[]
  const real = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  const savedBin = process.env.IRSIM_BIN
  let dispose: (() => void) | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'irsim-opencode-'))
    log = join(dir, 'argv.log')
    writeFileSync(join(dir, 'claim.json'), JSON.stringify(CLAIM))
    const bin = join(dir, 'irsim')
    writeFileSync(
      bin,
      [
        '#!/bin/sh',
        `printf '%s\\n' "$*" >> '${log}'`,
        'if [ "$2" = "claim" ]; then',
        `  cat '${join(dir, 'claim.json')}'`,
        'fi',
        '',
      ].join('\n'),
    )
    chmodSync(bin, 0o755)
    process.env.IRSIM_BIN = bin
    ticks = []
    globalThis.setInterval = ((fn: () => Promise<void> | void, ms?: number) => {
      if (ms === 2000) ticks.push(fn)
      return real.setInterval(() => undefined, 1 << 30)
    }) as unknown as typeof setInterval
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    globalThis.setInterval = real.setInterval
    globalThis.clearInterval = real.clearInterval
    if (savedBin === undefined) delete process.env.IRSIM_BIN
    else process.env.IRSIM_BIN = savedBin
    rmSync(dir, { recursive: true, force: true })
  })

  const listen = async (prompt: () => Promise<unknown>) => {
    const commands: Command[] = []
    const prompts: { sessionID: string; text: string }[] = []
    const ctx = {
      location: { directory: dir },
      command: {
        transform: async (edit: (editor: { add: (command: Command) => void }) => void) =>
          edit({ add: (command) => commands.push(command) }),
      },
      tool: { transform: async () => undefined },
      session: {
        synthetic: async () => undefined,
        prompt: async (input: { sessionID: string; text: string }) => {
          prompts.push(input)
          return prompt()
        },
      },
    }
    dispose = (await plugin.setup(ctx)) as () => void
    await commands.find((command) => command.name === 'irsim')!.execute({ sessionID: SESSION })
    expect(ticks).toHaveLength(1)
    await ticks[0]!()
    const lines = readFileSync(log, 'utf8').trim().split('\n')
    return { prompts, lines }
  }

  it('releases the claimed ids when the prompt rejects', async () => {
    const { prompts, lines } = await listen(async () => {
      throw new Error('session busy')
    })
    expect(prompts).toEqual([{ sessionID: SESSION, text: CLAIM.text }])
    const release = lines.filter((line) => line.startsWith('bridge release'))
    expect(release).toHaveLength(1)
    expect(release[0]).toContain(`--session ${SESSION}`)
    expect(release[0]).toContain(`--claim ${JSON.stringify(CLAIM)}`)
  })

  it('does not release when the prompt resolves', async () => {
    const { prompts, lines } = await listen(async () => undefined)
    expect(prompts).toEqual([{ sessionID: SESSION, text: CLAIM.text }])
    expect(lines.some((line) => line.startsWith('bridge claim'))).toBe(true)
    expect(lines.some((line) => line.startsWith('bridge release'))).toBe(false)
  })
})
