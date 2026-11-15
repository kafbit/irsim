import type { BoardEdit, CanvasEdit } from '../lib/canvas-layout'

export const MERGE_WINDOW_MS = 1000

export type ApplyResult = { ok: true } | { ok: false; status: number; error: string }
export type Apply = (edit: CanvasEdit) => Promise<ApplyResult>
export type Direction = 'undo' | 'redo'

export type Outcome =
  | { kind: 'done'; direction: Direction; label: string }
  | { kind: 'dropped'; direction: Direction; name: string }
  | { kind: 'failed'; direction: Direction; message: string }
  | { kind: 'empty'; direction: Direction }

type Entry = { label: string; before: CanvasEdit; after: CanvasEdit; merge?: string; at: number }

function mergeBoards(first: BoardEdit[] = [], second: BoardEdit[] = []): BoardEdit[] {
  const merged = new Map<string, BoardEdit>()
  for (const edit of [...first, ...second])
    merged.set(edit.name, { ...merged.get(edit.name), ...edit })
  return [...merged.values()]
}

/** `second` wins per board field. Section edits are kept from `second` when it has any. */
function mergeEdits(first: CanvasEdit, second: CanvasEdit): CanvasEdit {
  const merged: CanvasEdit = { boards: mergeBoards(first.boards, second.boards) }
  const sections = second.sections ?? first.sections
  if (sections) merged.sections = sections
  return merged
}

const unmerged = ({ merge: _merge, ...rest }: Entry): Entry => rest

const missing = /no (?:board|section) named (\S+)/

function missingName(error: string, edit: CanvasEdit): string {
  const found = missing.exec(error)?.[1]
  if (found) return found
  return (
    edit.boards?.[0]?.name ?? edit.sections?.remove?.[0] ?? edit.sections?.set?.[0]?.id ?? 'a board'
  )
}

/**
 * Undo and redo for one page, in memory. An entry holds the edit that reverts a change and the edit
 * that repeats it, each with only the fields the change touched. `apply` sends an edit to the
 * server. A 400 or 404 answer means a board or section is gone: the entry is dropped. Any other
 * failure keeps the entry. Consecutive entries with the same `merge` key within `MERGE_WINDOW_MS`
 * become one entry that keeps the first `before`.
 */
export function createHistory(apply: Apply, now: () => number = Date.now) {
  let undos: Entry[] = []
  let redos: Entry[] = []
  let busy: Promise<unknown> = Promise.resolve()

  const record = (label: string, before: CanvasEdit, after: CanvasEdit, merge?: string) => {
    const at = now()
    const last = undos.at(-1)
    redos = []
    if (last && merge !== undefined && last.merge === merge && at - last.at < MERGE_WINDOW_MS) {
      undos[undos.length - 1] = {
        ...last,
        label,
        after: mergeEdits(last.after, after),
        at,
      }
      return
    }
    undos = [...undos, { label, before, after, ...(merge === undefined ? {} : { merge }), at }]
  }

  const step = async (direction: Direction): Promise<Outcome> => {
    const from = direction === 'undo' ? undos : redos
    const entry = from.at(-1)
    if (!entry) return { kind: 'empty', direction }
    const edit = direction === 'undo' ? entry.before : entry.after
    const result = await apply(edit)
    const rest = from.filter((candidate) => candidate !== entry)
    if (!result.ok) {
      if (result.status === 400 || result.status === 404) {
        if (direction === 'undo') undos = rest
        else redos = rest
        return { kind: 'dropped', direction, name: missingName(result.error, edit) }
      }
      return { kind: 'failed', direction, message: result.error }
    }
    if (direction === 'undo') {
      undos = rest
      redos = [...redos, unmerged(entry)]
    } else {
      redos = rest
      undos = [...undos, unmerged(entry)]
    }
    return { kind: 'done', direction, label: entry.label }
  }

  const run = (direction: Direction) => {
    const next = busy.then(() => step(direction))
    busy = next.catch(() => undefined)
    return next
  }

  return {
    record,
    undo: () => run('undo'),
    redo: () => run('redo'),
    canUndo: () => undos.length > 0,
    canRedo: () => redos.length > 0,
    clear: () => {
      undos = []
      redos = []
    },
  }
}

export type History = ReturnType<typeof createHistory>

export function noticeFor(outcome: Outcome): { message: string; tone: 'info' | 'error' } | null {
  const verb = outcome.direction === 'undo' ? 'undo' : 'redo'
  switch (outcome.kind) {
    case 'done':
      return {
        message: `${outcome.direction === 'undo' ? 'Undid' : 'Redid'} ${outcome.label}`,
        tone: 'info',
      }
    case 'dropped':
      return { message: `Could not ${verb}: ${outcome.name} no longer exists`, tone: 'error' }
    case 'failed':
      return { message: `Could not ${verb}: ${outcome.message}`, tone: 'error' }
    case 'empty':
      return null
  }
}
