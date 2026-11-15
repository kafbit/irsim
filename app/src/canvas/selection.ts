export type Selection = { names: string[]; interacting: boolean }

export type SelectionAction =
  | { type: 'select'; name: string | null }
  | { type: 'toggle'; name: string }
  | { type: 'add'; names: string[] }
  | { type: 'set'; names: string[] }
  | { type: 'selectAll'; names: string[] }
  | { type: 'interact'; name?: string }
  | { type: 'escape' }

export const NO_SELECTION: Selection = { names: [], interacting: false }

const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && a.every((name, index) => name === b[index])

const unique = (names: string[]) => [...new Set(names)]

function choose(state: Selection, names: string[]): Selection {
  if (names.length === 0)
    return state.names.length === 0 && !state.interacting ? state : NO_SELECTION
  return sameNames(state.names, names) && !state.interacting ? state : { names, interacting: false }
}

/**
 * Any change of the selection leaves interaction. Interaction applies to exactly one board. Esc
 * leaves interaction first, then clears the selection. Same object when nothing changes.
 */
export function reduceSelection(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case 'select':
      return choose(state, action.name === null ? [] : [action.name])
    case 'toggle':
      return choose(
        state,
        state.names.includes(action.name)
          ? state.names.filter((name) => name !== action.name)
          : [...state.names, action.name],
      )
    case 'add':
      return choose(state, unique([...state.names, ...action.names]))
    case 'set':
    case 'selectAll':
      return choose(state, unique(action.names))
    case 'interact': {
      const name = action.name ?? (state.names.length === 1 ? state.names[0] : undefined)
      if (name === undefined) return state
      return state.names.length === 1 && state.names[0] === name && state.interacting
        ? state
        : { names: [name], interacting: true }
    }
    case 'escape':
      if (state.interacting) return { names: state.names, interacting: false }
      return state.names.length === 0 ? state : NO_SELECTION
  }
}
