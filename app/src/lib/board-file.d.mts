export const BOARD_SUFFIX: '.html'
export const LEGACY_SUFFIX: '.dc.html'
export function boardNameOf(value: string): string
export function isBoardSource(source: string): boolean
export function boardFileName(dir: string, name: string): string | null
export function listBoards(dir: string): { name: string; file: string; legacy: boolean }[]
