/**
 * irsim connector for pi.
 *
 * Place at ~/.pi/agent/extensions/irsim.ts (or load with `pi --extension ./irsim.ts`).
 * It registers /irsim, /irsim-stop, /irsim-comments and the design_canvas tool, and polls the
 * canvas for comments while the session listens. Every canvas call goes through
 * `irsim bridge`, so this file holds no HTTP or port logic of its own.
 */

import { execFile } from 'node:child_process'
import { StringEnum, Type } from '@earendil-works/pi-ai'
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

const BRIDGE_MS = 15000
const POLL_MS = 2000

const bridgeBin = (): string => {
  const value = process.env.IRSIM_BIN
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'irsim'
}

type BridgeResult = { ok: boolean; text: string }

const bridge = (args: string[], cwd: string, signal?: AbortSignal): Promise<BridgeResult> =>
  new Promise((resolve) => {
    execFile(
      bridgeBin(),
      ['bridge', ...args],
      { cwd, timeout: BRIDGE_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', signal },
      (error, stdout, stderr) => {
        resolve(
          error
            ? { ok: false, text: String(stderr || error.message).trim() }
            : { ok: true, text: String(stdout).trim() },
        )
      },
    )
  })

const flag = (args: string[], name: string, value: unknown): void => {
  if (typeof value === 'string' && value !== '') args.push(`--${name}`, value)
}

const toolArgs = (params: Record<string, unknown>, cwd: string): string[] => {
  const args = ['tool', '--action', String(params.action ?? ''), '--cwd', cwd]
  flag(args, 'page', params.page)
  flag(args, 'board', params.board)
  flag(args, 'status', params.status)
  flag(args, 'id', params.id)
  flag(args, 'body', params.body)
  flag(args, 'session', params.session)
  return args
}

export default function (pi: ExtensionAPI): void {
  const timers = new Map<string, ReturnType<typeof setInterval>>()
  const contexts = new Map<string, ExtensionCommandContext>()
  let listening: string | null = null

  const clear = (sessionId: string | null): void => {
    if (!sessionId) return
    const timer = timers.get(sessionId)
    if (timer) clearInterval(timer)
    timers.delete(sessionId)
    contexts.delete(sessionId)
  }

  const listen = async (ctx: ExtensionCommandContext): Promise<string> => {
    const sessionId = ctx.sessionManager.getSessionId()
    const registered = await bridge(
      ['register', '--agent', 'pi', '--session', sessionId, '--cwd', ctx.cwd],
      ctx.cwd,
    )
    if (!registered.ok) return registered.text
    contexts.set(sessionId, ctx)
    listening = sessionId
    if (!timers.has(sessionId)) {
      const timer = setInterval(async () => {
        const current = contexts.get(sessionId)
        if (!current) return
        const claimed = await bridge(
          ['claim', '--session', sessionId, '--cwd', current.cwd],
          current.cwd,
        )
        if (!claimed.ok || claimed.text === '') return
        try {
          if (current.isIdle()) pi.sendUserMessage(claimed.text)
          else pi.sendUserMessage(claimed.text, { deliverAs: 'followUp' })
        } catch {
          /* the session moved on */
        }
      }, POLL_MS)
      timer.unref?.()
      timers.set(sessionId, timer)
    }
    return `Listening for irsim comments in ${sessionId}.`
  }

  pi.registerTool({
    name: 'design_canvas',
    label: 'Design canvas',
    description:
      'Reads and answers design canvas comments, checks boards, and checks the project. Actions: open, page, comments, reply, resolve, check, doctor. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
    parameters: Type.Object({
      action: StringEnum(['open', 'page', 'comments', 'reply', 'resolve', 'check', 'doctor'] as const),
      page: Type.Optional(Type.String({ description: 'Page id, for open, page, comments and check.' })),
      board: Type.Optional(Type.String({ description: 'Board name, for open and check.' })),
      status: Type.Optional(
        StringEnum(['draft', 'queued', 'delivered', 'resolved'] as const),
      ),
      id: Type.Optional(Type.String({ description: 'Comment id, for reply and resolve.' })),
      body: Type.Optional(
        Type.String({
          description:
            'Reply text, for reply and resolve. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
        }),
      ),
      session: Type.Optional(Type.String({ description: 'Pi session for a reply.' })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = toolArgs(params, ctx.cwd)
      if (!args.includes('--session')) {
        args.push('--session', ctx.sessionManager.getSessionId())
      }
      const result = await bridge(args, ctx.cwd, signal)
      return {
        content: [{ type: 'text', text: result.ok ? result.text : `irsim: ${result.text}` }],
        details: { action: params.action, ok: result.ok },
      }
    },
  })

  pi.registerCommand('irsim', {
    description: 'Open irsim and listen for its comments',
    handler: async (args, ctx) => {
      const opened = await bridge(
        [
          'tool',
          '--action',
          'open',
          '--agent',
          'pi',
          '--session',
          ctx.sessionManager.getSessionId(),
          '--cwd',
          ctx.cwd,
          ...(args.trim() ? ['--target', args.trim()] : []),
        ],
        ctx.cwd,
      )
      const started = await listen(ctx)
      ctx.ui.notify(opened.ok ? `${opened.text} ${started}` : `irsim: ${opened.text}`, opened.ok ? 'info' : 'error')
    },
  })

  pi.registerCommand('irsim-stop', {
    description: 'Stop listening for irsim comments',
    handler: async (_args, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId()
      clear(sessionId)
      if (listening === sessionId) listening = null
      await bridge(['leave', '--session', sessionId, '--cwd', ctx.cwd], ctx.cwd)
      ctx.ui.notify('Stopped listening for irsim comments.', 'info')
    },
  })

  pi.registerCommand('irsim-comments', {
    description: 'Count the open irsim comments per page',
    handler: async (args, ctx) => {
      const tool = ['tool', '--action', 'comments', '--cwd', ctx.cwd]
      if (args.trim()) tool.push('--page', args.trim())
      const listed = await bridge(tool, ctx.cwd)
      ctx.ui.notify(listed.ok ? listed.text : `irsim: ${listed.text}`, listed.ok ? 'info' : 'error')
    },
  })

  pi.on('session_shutdown', async () => {
    for (const sessionId of [...timers.keys()]) {
      clear(sessionId)
      await bridge(['leave', '--session', sessionId], process.cwd()).catch(() => undefined)
    }
  })
}
