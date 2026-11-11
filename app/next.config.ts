import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': [
      './src/**',
      './tests/**',
      './test-setup/**',
      './scripts/**',
      './*.json',
      './*.toml',
      './bun.lock',
      './*.ts',
      './*.mjs',
      './tsconfig.tsbuildinfo',
    ],
  },
  reactStrictMode: true,
  // Next writes AGENTS.md and CLAUDE.md next to the config; this package is a dev tool with no
  // agent instructions of its own, and the files are noise in every diff.
  agentRules: false,
}

export default config
