import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Next writes AGENTS.md and CLAUDE.md next to the config; this package is a dev tool with no
  // agent instructions of its own, and the files are noise in every diff.
  agentRules: false,
  transpilePackages: ['@kafbit/contracts', '@kafbit/domain', '@kafbit/i18n', '@kafbit/ui'],
}

export default config
