export type Problem = {
  severity: 'error' | 'warning'
  file: string
  path: string
  rule: string
  message: string
  fix: string
}
export function lintDesign(designDir: string): { ok: boolean; problems: Problem[] }
export function readBoardMeta(source: string): { title: string; width: number; height: number }
