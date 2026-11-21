import type { Approval, Comment, PageRequest, Reply, VariantRequest } from './comments-types'
import { agentName } from './agents'
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

const replyLines = (reply: Reply, fresh: boolean, imagePaths: Record<string, string>): string => {
  const who =
    reply.author !== 'claude'
      ? 'You'
      : reply.agent && reply.agent !== 'claude-code'
        ? agentName(reply.agent)
        : 'Claude'
  const [first = '', ...rest] = reply.body.split('\n')
  const label = `   ${fresh ? 'NEW ' : ''}${who}: `
  const images = (reply.images ?? []).flatMap((id) => {
    const path = imagePaths[id]
    return path ? [`      image: ${path}`] : []
  })
  return [`${label}${first}`, ...rest.map((line) => `      ${line}`), ...images].join('\n')
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
    fresh.length > 0 ? comment.replies.map((reply) => replyLines(reply, fresh.includes(reply), imagePaths)) : []
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
  const batches = new Map<string, Approval[]>()
  for (const approval of approvals) {
    if (approval.batch) batches.set(approval.batch, [...(batches.get(approval.batch) ?? []), approval])
  }
  const batchLines = [...batches.values()].flatMap((group) => {
    const files = group.map((approval) => `${designFolder}/${approval.board}.dc.html`)
    const stale = group.filter((approval) => current[approval.id] === false)
    const note = group.find((approval) => approval.note)?.note
    return [
      `Design canvas: the user accepted every new and changed design on page ${group[0]?.page}: ${group.map((approval) => approval.board).join(', ')}. Start work on each design change and implement it.`,
      ...(note ? [indent(note)] : []),
      `   Read each file again first, because the user may have edited it: ${files.join(', ')}. Build the app from it and compare the board and the screen with screenshots.`,
      ...(stale.length > 0
        ? [
            `   ${stale.map((approval) => approval.board).join(', ')} changed after the approval. Ask the user to approve ${stale.length === 1 ? 'it' : 'them'} again before you build.`,
          ]
        : []),
    ]
  })
  const lines = approvals.filter((approval) => !approval.batch).flatMap((approval) => {
    const file = `${designFolder}/${approval.board}.dc.html`
    return [
      `Design canvas: the user approved board ${approval.board} (page ${approval.page}). This is the confirmation to build it.`,
      ...(approval.note ? [indent(approval.note)] : []),
      current[approval.id] === false
        ? `   The board changed after the approval. Ask the user to approve it again before you build.`
        : `   Read ${file} again first, because the user may have edited it, then build the app from it and compare the board and the screen with screenshots.`,
    ]
  })
  return [...batchLines, ...lines].join('\n')
}

/** The turn for variant requests: each variant file is a copy of the base that the agent edits in one direction. */
export const buildVariantText = (
  requests: VariantRequest[],
  designFolder = 'design',
  imagePaths: Record<string, string> = {},
): string => {
  const lines = requests.flatMap((request) => [
    request.pick
      ? `Design canvas: the user asked for ${request.variants.length} variants of board ${request.base} (page ${request.page}) from a comment on ${placeText(request.pick)} · ${targetText(request.pick)}. Each file below is a copy of ${designFolder}/${request.base}.dc.html; edit only that file.`
      : `Design canvas: the user asked for ${request.variants.length} variants of board ${request.base} (page ${request.page}). Each file below is a copy of ${designFolder}/${request.base}.dc.html; edit only that file.`,
    ...(request.pick && request.note ? [indent(request.note)] : []),
    ...request.variants.map(
      (variant) => `   ${designFolder}/${variant.name}.dc.html: ${variant.label}. ${variant.direction}`,
    ),
    ...(!request.pick && request.note ? [indent(request.note)] : []),
    ...(request.images ?? []).flatMap((id) => {
      const path = imagePaths[id]
      return path ? [`   image: ${path}`] : []
    }),
    `   Keep each board's size and the board conventions. Run design_canvas {action: "check", board} on each and look at the screenshot. Do not edit ${request.base}.dc.html; the user compares the variants and chooses one in irsim.`,
  ])
  return [...lines, REPLY_RULE].join('\n')
}

const scopeText = (request: PageRequest, title: string): string => {
  if (request.scope === 'board') return `the board ${request.board}`
  if (request.scope === 'boards') return `the boards ${(request.boards ?? []).join(', ')}`
  if (request.scope === 'section') return `the section ${request.section} of the page ${title}`
  return `the page ${title}`
}

const askLines = (
  request: PageRequest,
  title: string,
  designFolder: string,
  imagePaths: Record<string, string>,
): string[] => [
  request.page === ''
    ? 'Design canvas: the user wrote to you from the pages index, so no page is open. Add the boards to a new page or to the page that fits.'
    : `Design canvas: the user wrote to you from the canvas app. Scope: ${scopeText(request, title)} (page id ${request.page}).`,
  indent(request.prompt ?? ''),
  ...(request.images ?? []).flatMap((id) => {
    const path = imagePaths[id]
    return path ? [`   image: ${path}`] : []
  }),
  `   You may create or change boards and pages yourself, because the app has no manual page or board creation. Place every new board in ${designFolder}/canvas.json on the right page and section. Then run design_canvas {action: "check"} on the page you changed.`,
]

/** The turn for page requests: an icon for the page, or a tidy layout of its boards, both edits of canvas.json. */
export const buildPageRequestText = (
  requests: PageRequest[],
  titles: Record<string, string> = {},
  designFolder = 'design',
  imagePaths: Record<string, string> = {},
): string => {
  const lines = requests.flatMap((request) => {
    const title = titles[request.page] ?? request.page
    if (request.kind === 'ask') return askLines(request, title, designFolder, imagePaths)
    return request.kind === 'icon'
      ? [
          `Design canvas: the user asked for an icon for page ${title} (${request.page}).`,
          `   Choose a Lucide icon that fits the page and its boards. The name is kebab-case and must exist in lucide-react.`,
          `   Set it as "icon" on that page in ${designFolder}/canvas.json. Change nothing else.`,
        ]
      : [
          `Design canvas: the user asked you to tidy page ${title} (${request.page}).`,
          `   Group the boards of the page into sections by flow or feature. Create sections, and sub-sections where they help.`,
          `   Lay the boards out left to right in flow order with even gaps, and avoid overlaps.`,
          `   Edit only ${designFolder}/canvas.json (positions and sections), not the board files. Then run design_canvas {action: "check", page: "${request.page}"}.`,
        ]
  })
  return [...lines, REPLY_RULE].join('\n')
}
