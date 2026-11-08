export type Selection = { name: string | null; interacting: boolean }

export type SelectionAction =
  | { type: 'select'; name: string | null }
  | { type: 'interact'; name?: string }
  | { type: 'escape' }

export const NO_SELECTION: Selection = { name: null, interacting: false }

/** Selecting moves out of interaction; Esc leaves interaction first, then deselects. Same object when nothing changes. */
export function reduceSelection(state: Selection, action: SelectionAction): Selection {
  if (action.type === 'select') {
    return state.name === action.name && !state.interacting
      ? state
      : { name: action.name, interacting: false }
  }
  if (action.type === 'interact') {
    const name = action.name ?? state.name
    if (name === null) return state
    return state.name === name && state.interacting ? state : { name, interacting: true }
  }
  if (state.interacting) return { name: state.name, interacting: false }
  return state.name === null ? state : NO_SELECTION
}
