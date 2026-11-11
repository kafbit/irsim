import type { Register } from 'claude-code'
import { api, listenKey, messageOf, registerSession } from './api'
import { commentCounts, openCanvas, stopCanvas } from './canvas'
import { stopPolling, syncPoll } from './poll'
import { TOOL_DESCRIPTION, TOOL_MATCH, TOOL_NAME, TOOL_SCHEMA, runTool } from './tool'

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'irsim',
      description: 'Open irsim and listen for its comments',
      argumentHint: '[page or board]',
      immediate: true,
    })
    await $.command.register({
      name: 'irsim-stop',
      description: 'Stop listening for irsim comments',
      immediate: true,
    })
    await $.command.register({
      name: 'irsim-comments',
      description: 'Count the open irsim comments per page',
      immediate: true,
    })
    await $.tool
      .register({
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: TOOL_SCHEMA,
        isDeferred: false,
      })
      .catch((error: unknown) =>
        $.ui.log(`irsim: tool not registered, ${messageOf(error)}`),
      )
    const sessionId = await $.session.id()
    if (await $.store.get(listenKey(sessionId))) {
      await registerSession($, e.cwd, sessionId).catch(() => undefined)
      await syncPoll($)
    }
    return started
  })

  on('command.run', { command: ['irsim', 'irsim-stop', 'irsim-comments'] }, async ($, e) => {
    try {
      if (e.command === 'irsim') return { text: await openCanvas($, e.args) }
      if (e.command === 'irsim-stop') return { text: await stopCanvas($) }
      return { text: await commentCounts($) }
    } catch (error) {
      return { text: `irsim: ${messageOf(error)}` }
    }
  })

  on('tool.call', { tool: TOOL_MATCH }, async ($, e) => {
    try {
      return { result: await runTool($, e as unknown as Record<string, unknown>) }
    } catch (error) {
      return { deny: `design_canvas: ${messageOf(error)}` }
    }
  })

  on('turn.complete', async ($, e, next) => {
    void syncPoll($).catch(() => undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stopPolling($)
    await $.store.delete(listenKey(e.sessionId)).catch(() => undefined)
    await api($, `/api/sessions/${encodeURIComponent(e.sessionId)}`, { method: 'DELETE' }).catch(
      () => undefined,
    )
    return next(e)
  })
}
