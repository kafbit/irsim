import type { Approval, Comment, Reply } from './comments-types'
import { isWholeBoard, placeText, targetText } from './place-text'
import { viewportLine } from './view-label'

export const REPLY_RULE =
  'Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.'

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

const item = (
  comment: Comment,
  index: number,
  imagePaths: Record<string, string>,
  designFolder: string,
): string => {
  const place = placeText(
    isWholeBoard(comment)
      ? { file: `${designFolder}/${comment.board}.dc.html`, line: 0 }
      : comment,
  )
  const target = targetText(comment)
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
    ...(comment.view ? [`   ${viewportLine(comment.view)}`] : []),
    ...images,
    ...replies,
  ].join('\n')
}

/** The turn a session receives for a claim: written once here so the plugin and the CLI agree. */
export const buildTurnText = (
  comments: Comment[],
  imagePaths: Record<string, string> = {},
  designFolder = 'design',
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
  const wholeBoard = comments.some(isWholeBoard)
    ? ' A comment without a line is about the whole board, so read the board file as needed.'
    : ''
  return [
    `Design canvas: ${comments.length} ${noun}${mix} ${where} (${batch}). Read only the lines named.${wholeBoard} Boards live in ${designFolder}/.`,
    ...comments.map((comment, index) => item(comment, index, imagePaths, designFolder)),
    'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
    REPLY_RULE,
    `Ids: ${comments.map((comment) => comment.id).join(', ')}`,
  ].join('\n')
}

/**
 * The turn for approvals: each one is the user's confirmation to build that board (step 4 of the
 * irsim workflow). `current` maps an approval id to whether the board is still as approved.
 */
export const buildApprovalText = (
  approvals: Approval[],
  current: Record<string, boolean>,
  designFolder = 'design',
): string => {
  const lines = approvals.flatMap((approval) => {
    const file = `${designFolder}/${approval.board}.dc.html`
    return [
      `Design canvas: the user approved board ${approval.board} (page ${approval.page}). This is the confirmation to build it.`,
      ...(approval.note ? [indent(approval.note)] : []),
      current[approval.id] === false
        ? `   The board changed after the approval. Ask the user to approve it again before you build.`
        : `   Read ${file} again first, because the user may have edited it, then build the app from it and compare the board and the screen with screenshots.`,
    ]
  })
  return lines.join('\n')
}
