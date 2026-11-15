export const AGENT_IDS = [
  'claude-code',
  'codex',
  'opencode',
  'pi',
  'command-code',
  'other',
] as const

export type AgentId = (typeof AGENT_IDS)[number]

export const AGENT_NAMES: Record<AgentId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
  'command-code': 'Command Code',
  other: 'Agent',
}

export const isAgentId = (value: unknown): value is AgentId =>
  typeof value === 'string' && (AGENT_IDS as readonly string[]).includes(value)

/** A missing value is an old Claude Code plugin; an unknown one is some other agent. */
export const agentOf = (value: unknown): AgentId => {
  if (value === undefined || value === null || value === '') return 'claude-code'
  return isAgentId(value) ? value : 'other'
}

export const agentName = (agent: AgentId | undefined): string =>
  AGENT_NAMES[agent ?? 'claude-code']
