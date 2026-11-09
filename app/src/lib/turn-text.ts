import type { Comment, Reply } from './comments-types'

const unique = (values: string[]): string[] => [...new Set(values)]

const boardOf = (file: string): string => file.replace(/^.*\//, '').replace(/\.dc\.html$/, '')

const indent = (body: string): string =>
  body
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')

export const unseenUserReplies = (comment: Comment): Reply[] =>
  comment.replies.filter((reply) => reply.author === 'user' && !reply.seen)

const WAS_RESOLVED = ' (was resolved, resolve it again if the new reply is handled)'

const replyLines = (reply: Reply, fresh: boolean): string => {
  const who = reply.author === 'claude' ? 'Claude' : 'You'
  const [first = '', ...rest] = reply.body.split('\n')
  const label = `   ${fresh ? 'NEW ' : ''}${who}: `
  return [`${label}${first}`, ...rest.map((line) => `      ${line}`)].join('\n')
}

const item = (comment: Comment, index: number, imagePaths: Record<string, string>): string => {
  const place = `${comment.file}:${comment.line}`
  const target = `${comment.element.path} "${comment.element.text}"`
  const board = boardOf(comment.file) === comment.board ? '' : ` · on board ${comment.board}`
  const fresh = unseenUserReplies(comment)
  const followUp = fresh.length > 0 ? ` · follow-up${comment.reopened ? WAS_RESOLVED : ''}` : ''
  const images = (comment.images ?? []).flatMap((id) => {
    const path = imagePaths[id]
    return path ? [`   image: ${path}`] : []
  })
  const replies =
    fresh.length > 0 ? comment.replies.map((reply) => replyLines(reply, fresh.includes(reply))) : []
  return [
    `${index + 1}. ${place} · ${target}${board}${followUp}`,
    indent(comment.body),
    ...images,
    ...replies,
  ].join('\n')
}

/** The turn a session receives for a claim: written once here so the plugin and the CLI agree. */
export const buildTurnText = (
  comments: Comment[],
  imagePaths: Record<string, string> = {},
): string => {
  const pages = unique(comments.map((comment) => comment.page))
  const batches = unique(comments.flatMap((comment) => (comment.batch ? [comment.batch] : [])))
  const noun = comments.length === 1 ? 'comment' : 'comments'
  const where = pages.length === 1 ? `on page ${pages[0]}` : `on pages ${pages.join(', ')}`
  const batch = batches.length === 1 ? `batch ${batches[0]}` : `batches ${batches.join(', ')}`
  const followUps = comments.filter((comment) => unseenUserReplies(comment).length > 0).length
  const mix =
    followUps > 0
      ? ` (${comments.length - followUps} new, ${followUps} follow-up${followUps === 1 ? '' : 's'})`
      : ''
  return [
    `Design canvas: ${comments.length} ${noun}${mix} ${where} (${batch}). Read only the lines named; boards live in design/.`,
    ...comments.map((comment, index) => item(comment, index, imagePaths)),
    'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
    `Ids: ${comments.map((comment) => comment.id).join(', ')}`,
  ].join('\n')
}
