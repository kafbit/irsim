/**
 * irsim connector for Command Code.
 *
 * Place at ~/.commandcode/mods/irsim.ts (personal) or <project>/.commandcode/mods/irsim.ts.
 * It registers /irsim, /irsim-stop, /irsim-comments and the design_canvas tool, and polls the
 * canvas for comments while the session listens. Every canvas call goes through
 * `irsim bridge`, so this file holds no HTTP or port logic of its own.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModApi } from '@commandcode/harness'

const POLL_MS = 2000

type Disposable = { dispose(): void }

const bridgeBin = (): string => {
  const value = process.env.IRSIM_BIN
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'irsim'
}

const SESSION_CONTEXT =
  'This project keeps its screens as irsim boards. Load the `irsim-design` skill before you create or edit a board file or design/canvas.json, and the `irsim-workflow` skill before you change what a screen shows. Run `irsim lint` and design_canvas check before you say you are done.'

const hasIrsimConfig = (from: string): boolean => {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, '.irsim.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

const flag = (args: string[], name: string, value: unknown): void => {
  if (typeof value === 'string' && value !== '') args.push(`--${name}`, value)
}

export default function (cmd: ModApi): void {
  let sessionId = `command-code-${randomUUID()}`
  let cwd = process.cwd()
  let polling: Disposable | null = null

  for (const name of ['irsim-workflow', 'irsim-design']) {
    try {
      const skill = [`../../skills/${name}`, `../../../plugin/skills/${name}`]
        .map((path) => fileURLToPath(new URL(path, import.meta.url)))
        .find((path) => existsSync(path))
      if (skill) cmd.addSkillsPath(skill)
    } catch {
      /* the host may reject an extra skills path */
    }
  }

  cmd.on('run_start', (event) => {
    if (event.type === 'run_start' && typeof event.sessionId === 'string' && event.sessionId) {
      sessionId = event.sessionId
    }
  })

  const runBridge = async (
    args: string[],
    directory = cwd,
  ): Promise<{ ok: boolean; text: string }> => {
    try {
      const result = await cmd.exec({ command: bridgeBin(), args: ['bridge', ...args], cwd: directory })
      return result.code === 0
        ? { ok: true, text: String(result.stdout).trim() }
        : { ok: false, text: String(result.stderr || result.stdout).trim() }
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) }
    }
  }

  const stopPolling = (): void => {
    polling?.dispose()
    polling = null
  }

  const startPolling = (): void => {
    stopPolling()
    polling = cmd.clock.every(POLL_MS, async () => {
      const claimed = await runBridge(['claim', '--session', sessionId, '--cwd', cwd, '--json'])
      if (!claimed.ok || claimed.text === '') return
      let count = 0
      let text = ''
      try {
        ;({ count, text } = JSON.parse(claimed.text) as { count: number; text: string })
      } catch {
        return
      }
      if (!(count > 0 && text)) return
      try {
        await cmd.sendUserMessage(text)
      } catch {
        await runBridge(['release', '--session', sessionId, '--cwd', cwd, '--claim', claimed.text])
      }
    })
  }

  const listen = async (directory: string): Promise<string> => {
    cwd = directory
    const registered = await runBridge(
      ['register', '--agent', 'command-code', '--session', sessionId, '--cwd', cwd],
      cwd,
    )
    if (!registered.ok) return registered.text
    startPolling()
    return `Listening for irsim comments in ${sessionId}.`
  }

  cmd.addTool({
    schema: {
      name: 'design_canvas',
      description:
        'Reads and answers design canvas comments, checks boards, lints the design folder, and checks the project. Actions: open, page, comments, reply, resolve, check, lint, doctor. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at, after the format and layout problems of the design folder. lint lists the format and layout problems of the board files and design/canvas.json. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['open', 'page', 'comments', 'reply', 'resolve', 'check', 'lint', 'doctor'],
          },
          page: { type: 'string', description: 'Page id, for open, page, comments and check.' },
          board: { type: 'string', description: 'Board name, for open and check.' },
          status: {
            type: 'string',
            enum: ['draft', 'queued', 'delivered', 'resolved'],
            description: 'Filter for comments.',
          },
          id: { type: 'string', description: 'Comment id, for reply and resolve.' },
          body: {
            type: 'string',
            description:
              'Reply text, for reply and resolve. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
          },
        },
        required: ['action'],
      },
    },
    run: async ({ input }) => {
      const args = ['tool', '--action', String(input.action ?? ''), '--cwd', cwd]
      flag(args, 'page', input.page)
      flag(args, 'board', input.board)
      flag(args, 'status', input.status)
      flag(args, 'id', input.id)
      flag(args, 'body', input.body)
      flag(args, 'session', sessionId)
      const result = await runBridge(args)
      if (!result.ok) return { ok: false, error: `irsim: ${result.text}` }
      return { ok: true, content: [{ type: 'text', text: result.text }] }
    },
  })

  cmd.addCommand({
    name: 'irsim',
    description: 'Open irsim and listen for its comments',
    argumentHint: '[page or board]',
    handler: async (context) => {
      cwd = context.cwd ?? process.cwd()
      const opened = await runBridge(
        [
          'tool',
          '--action',
          'open',
          '--agent',
          'command-code',
          '--session',
          sessionId,
          '--cwd',
          cwd,
          ...(context.args?.trim() ? ['--target', context.args.trim()] : []),
        ],
      )
      const started = await listen(cwd)
      return { message: opened.ok ? `${opened.text} ${started}` : `irsim: ${opened.text}` }
    },
  })

  cmd.addCommand({
    name: 'irsim-stop',
    description: 'Stop listening for irsim comments',
    handler: async () => {
      stopPolling()
      await runBridge(['leave', '--session', sessionId, '--cwd', cwd])
      return { message: 'Stopped listening for irsim comments.' }
    },
  })

  cmd.addCommand({
    name: 'irsim-comments',
    description: 'Count the open irsim comments per page',
    handler: async (context) => {
      const args = ['tool', '--action', 'comments', '--cwd', cwd]
      if (context.args?.trim()) args.push('--page', context.args.trim())
      const listed = await runBridge(args)
      return { message: listed.ok ? listed.text : `irsim: ${listed.text}` }
    },
  })

  cmd.hooks({
    appendSystemPrompt: () => (hasIrsimConfig(cwd) ? SESSION_CONTEXT : undefined),
    onSessionStart: () => {
      cwd = process.cwd()
    },
    onSessionEnd: () => {
      stopPolling()
      void runBridge(['leave', '--session', sessionId, '--cwd', cwd])
    },
  })
}
