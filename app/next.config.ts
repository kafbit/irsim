import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/*
 * `@bond/i18n` publishes `dist`, which a fresh worktree has not built. The canvas must open on
 * `bun run canvas` alone, so the package resolves to its source here. Everything else is already
 * source-first through `transpilePackages`.
 */
const i18nSource = fileURLToPath(new URL('../../packages/i18n/src/index.ts', import.meta.url))

const config: NextConfig = {
  reactStrictMode: true,
  // Next writes AGENTS.md and CLAUDE.md next to the config; this package is a dev tool with no
  // agent instructions of its own, and the files are noise in every diff.
  agentRules: false,
  transpilePackages: ['@bond/contracts', '@bond/domain', '@bond/i18n', '@bond/ui'],
  turbopack: { resolveAlias: { '@bond/i18n': i18nSource } },
}

export default config
