// irsim connector for OpenCode v2.
//
// Loads from ~/.config/opencode/plugins/irsim.js (or .opencode/plugins/). It registers
// /irsim, /irsim-stop, /irsim-comments and the design_canvas tool, and polls the canvas
// for comments while a session listens. Every canvas call goes through `irsim bridge`,
// so this file stays small and holds no HTTP or port logic of its own.

import { execFile } from 'node:child_process'

const BRIDGE_MS = 15000
const POLL_MS = 2000

const bridgeBin = () => {
  const value = process.env.IRSIM_BIN
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'irsim'
}

const bridge = (args, cwd, signal) =>
  new Promise((resolve) => {
    const child = execFile(
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
    child.on('error', () => undefined)
  })

const flag = (args, name, value) => {
  if (typeof value === 'string' && value !== '') args.push(`--${name}`, value)
}

const toolArgs = (input, cwd) => {
  const args = ['tool', '--action', String(input.action ?? ''), '--cwd', cwd]
  flag(args, 'page', input.page)
  flag(args, 'board', input.board)
  flag(args, 'status', input.status)
  flag(args, 'id', input.id)
  flag(args, 'body', input.body)
  return args
}

export default {
  id: 'irsim',
  async setup(ctx) {
    const directory = ctx.location?.directory ?? process.cwd()
    const timers = new Map()
    const polling = new Set()
    let disposed = false

    const start = async (sessionID) => {
      if (!sessionID) return 'No OpenCode session to register.'
      const registered = await bridge(
        ['register', '--agent', 'opencode', '--session', sessionID, '--cwd', directory],
        directory,
      )
      if (!registered.ok) return registered.text
      if (!timers.has(sessionID)) {
        const poll = async () => {
          const claimed = await bridge(
            ['claim', '--session', sessionID, '--cwd', directory, '--json'],
            directory,
          )
          if (!claimed.ok || claimed.text === '') return
          let count = 0
          let text = ''
          try {
            ;({ count, text } = JSON.parse(claimed.text))
          } catch {
            return
          }
          if (!(count > 0 && text)) return
          const delivered = await ctx.session
            .prompt({ sessionID, text })
            .then(() => true)
            .catch(() => false)
          if (!delivered)
            await bridge(
              ['release', '--session', sessionID, '--cwd', directory, '--claim', claimed.text],
              directory,
            )
        }
        const timer = setInterval(async () => {
          if (disposed || polling.has(sessionID)) return
          polling.add(sessionID)
          try {
            await poll()
          } finally {
            polling.delete(sessionID)
          }
        }, POLL_MS)
        timer.unref?.()
        timers.set(sessionID, timer)
      }
      return `Listening for irsim comments in ${sessionID}.`
    }

    const stop = async (sessionID) => {
      const timer = timers.get(sessionID)
      if (timer) clearInterval(timer)
      timers.delete(sessionID)
      await bridge(['leave', '--session', sessionID, '--cwd', directory], directory)
      return `Stopped listening for irsim comments in ${sessionID}.`
    }

    try {
      await ctx.command.transform((editor) => {
        editor.add({
          name: 'irsim',
          description: 'Open irsim and listen for its comments',
          execute: async ({ sessionID, prompt }) => {
            const opened = await bridge(
              [
                'tool',
                '--action',
                'open',
                '--agent',
                'opencode',
                '--session',
                sessionID,
                '--cwd',
                directory,
                ...(prompt?.text?.trim() ? ['--target', prompt.text.trim()] : []),
              ],
              directory,
            )
            const listening = await start(sessionID)
            const text = opened.ok ? opened.text : `irsim: ${opened.text}`
            await ctx.session.synthetic({ sessionID, text: `${text}\n${listening}` }).catch(() => undefined)
          },
        })
        editor.add({
          name: 'irsim-stop',
          description: 'Stop listening for irsim comments',
          execute: async ({ sessionID }) => {
            await stop(sessionID)
          },
        })
        editor.add({
          name: 'irsim-comments',
          description: 'Count the open irsim comments per page',
          execute: async ({ sessionID, prompt }) => {
            const args = ['tool', '--action', 'comments', '--cwd', directory]
            flag(args, 'page', prompt?.text?.trim())
            const listed = await bridge(args, directory)
            await ctx.session
              .synthetic({ sessionID, text: listed.ok ? listed.text : `irsim: ${listed.text}` })
              .catch(() => undefined)
          },
        })
      })
    } catch {
      /* a host without command transforms keeps the tools */
    }

    try {
      await ctx.tool.transform((editor) => {
        editor.add({
          name: 'design_canvas',
          description:
            'Reads and answers design canvas comments, checks boards, lints the design folder, and checks the project. Actions: open, page, comments, reply, resolve, check, lint, doctor. check renders a board (or every board of a page) in headless Chromium and returns errors, warnings and a screenshot path to look at, after the format and layout problems of the design folder. lint lists the format and layout problems of the board files and design/canvas.json. doctor checks the project rules, git setup and config. Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
          input: {
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
              session: { type: 'string', description: 'OpenCode session for a reply.' },
            },
            required: ['action'],
          },
          execute: async (input, context) => {
            const args = toolArgs(input, directory)
            flag(args, 'session', input.session ?? context?.sessionID)
            const result = await bridge(args, directory, context?.signal)
            return { content: result.ok ? result.text : `irsim: ${result.text}` }
          },
        })
      })
    } catch {
      /* a host without tool transforms keeps the commands */
    }

    // Keep the registered session fresh while the plugin is idle, so it stays in the canvas picker.
    const heartbeat = setInterval(async () => {
      if (disposed) return
      for (const sessionID of timers.keys()) {
        await bridge(
          ['register', '--agent', 'opencode', '--session', sessionID, '--cwd', directory],
          directory,
        )
      }
    }, 20_000)
    heartbeat.unref?.()

    return () => {
      disposed = true
      clearInterval(heartbeat)
      for (const timer of timers.values()) clearInterval(timer)
      timers.clear()
    }
  },
}
