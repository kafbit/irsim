import type { AskScope } from './page-requests'

export type ComposerScope =
  | { kind: 'none' }
  | { kind: 'page'; title: string }
  | { kind: 'board'; name: string; title: string }
  | { kind: 'boards'; names: string[] }
  | { kind: 'section'; id: string; title: string }

export const COMPOSER_PLACEHOLDER = 'Ask the agent...'
export const SEND_HINT = 'Enter sends, Shift+Enter adds a line'
export const NO_SESSION_HINT = 'No agent session listening. Run /irsim in your coding agent.'

export const scopeLabel = (scope: ComposerScope): string | null => {
  if (scope.kind === 'none') return null
  if (scope.kind === 'boards') return `${scope.names.length} boards`
  return scope.title
}

export const askScope = (scope: ComposerScope): AskScope => {
  if (scope.kind === 'board') return { scope: 'board', board: scope.name }
  if (scope.kind === 'boards') return { scope: 'boards', boards: scope.names }
  if (scope.kind === 'section') return { scope: 'section', section: scope.id }
  return { scope: 'page' }
}

export const canSend = (input: {
  text: string
  sessionId: string | null
  uploading: number
  pending: boolean
}): boolean =>
  input.text.trim() !== '' && input.sessionId !== null && input.uploading === 0 && !input.pending

export const canGenerate = (input: {
  sessionId: string | null
  presets: number
  pending: boolean
}): boolean => input.sessionId !== null && input.presets > 0 && !input.pending

export const hintFor = (sessionId: string | null, loaded: boolean): string =>
  loaded && sessionId === null ? NO_SESSION_HINT : SEND_HINT
