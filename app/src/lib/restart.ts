export const RESTART_CODE = 75

let exit: (code: number) => void = (code) => process.exit(code)

export const exitProcess = (code: number): void => exit(code)

export const setExit = (next: (code: number) => void): (() => void) => {
  const previous = exit
  exit = next
  return () => {
    exit = previous
  }
}
