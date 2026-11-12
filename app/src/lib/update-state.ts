let updating = false

export const isUpdating = (): boolean => updating

export const setUpdating = (value: boolean): void => {
  updating = value
}
