type State = { updating: boolean }

const holder = globalThis as typeof globalThis & { __irsimUpdating?: State }
const state = (holder.__irsimUpdating ??= { updating: false })

export const isUpdating = (): boolean => state.updating

export const setUpdating = (value: boolean): void => {
  state.updating = value
}
