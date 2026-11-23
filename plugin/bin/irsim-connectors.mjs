#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), '..')
const USAGE = `usage: irsim-connectors antigravity [--uninstall]\n`

const fail = (message, code = 1) => {
  console.error(`irsim-connectors: ${message}`)
  process.exit(code)
}

const args = process.argv.slice(2)
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  process.stdout.write(USAGE)
  process.exit(0)
}

let uninstall = false
const positional = []
for (const arg of args) {
  if (arg === '--uninstall') uninstall = true
  else if (arg.startsWith('-')) fail(`unknown option ${arg}`, 2)
  else positional.push(arg)
}

const agent = positional[0]
if (positional.length !== 1 || (agent !== 'antigravity' && agent !== 'agy')) {
  fail(agent ? `unknown agent ${agent}, expected antigravity` : 'missing agent, expected antigravity', 2)
}

const agyArgs = uninstall
  ? ['plugin', 'uninstall', 'irsim']
  : (() => {
      const pluginDir = join(PKG_ROOT, 'harnesses', 'antigravity')
      if (!existsSync(pluginDir)) fail(`Antigravity plugin not found at ${pluginDir}`)
      return ['plugin', 'install', pluginDir]
    })()

const res = spawnSync('agy', agyArgs, { stdio: 'inherit' })
if (res.error?.code === 'ENOENT') fail('agy is not installed or not on PATH')
if (res.error) fail(res.error.message)
process.exit(res.status ?? 1)
