import type { Comment } from './comments-types'

const unique = (values: string[]): string[] => [...new Set(values)]

const boardOf = (file: string): string => file.replace(/^.*\//, '').replace(/\.dc\.html$/, '')

const indent = (body: string): string =>
  body
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')

const item = (comment: Comment, index: number): string => {
  const place = `${comment.file}:${comment.line}`
  const target = `${comment.element.path} "${comment.element.text}"`
  const board = boardOf(comment.file) === comment.board ? '' : ` · on board ${comment.board}`
  return `${index + 1}. ${place} · ${target}${board}\n${indent(comment.body)}`
}

/** The turn a session receives for a claim: written once here so the plugin and the CLI agree. */
export const buildTurnText = (comments: Comment[]): string => {
  const pages = unique(comments.map((comment) => comment.page))
  const batches = unique(comments.flatMap((comment) => (comment.batch ? [comment.batch] : [])))
  const noun = comments.length === 1 ? 'comment' : 'comments'
  const where = pages.length === 1 ? `on page ${pages[0]}` : `on pages ${pages.join(', ')}`
  const batch = batches.length === 1 ? `batch ${batches[0]}` : `batches ${batches.join(', ')}`
  return [
    `Design canvas: ${comments.length} ${noun} ${where} (${batch}). Read only the lines named; boards live in design/.`,
    ...comments.map(item),
    'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
    `Ids: ${comments.map((comment) => comment.id).join(', ')}`,
  ].join('\n')
}
