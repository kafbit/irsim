import type { ApprovalState } from './use-approvals'

export type PendingBoards = { changed: string[]; added: string[] }

export const pendingOf = (
  names: string[],
  stateOf: (name: string) => ApprovalState | undefined,
): PendingBoards => {
  const changed: string[] = []
  const added: string[] = []
  for (const name of names) {
    const state = stateOf(name)
    if (state === 'changed') changed.push(name)
    else if (state === 'new') added.push(name)
  }
  return { changed, added }
}
