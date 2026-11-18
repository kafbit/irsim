import type { ApprovalState } from './approvals/use-approvals'
import { pendingOf } from './approvals/pending'
import { canNest, sharedSection } from './sections'
import type { CanvasSection } from './types'

export type MenuItemId =
  | 'copy'
  | 'play'
  | 'comment'
  | 'variants'
  | 'approve'
  | 'create-section'
  | 'rename-section'
  | 'create-sub-section'
  | 'remove-from-section'
  | 'delete-section'
  | 'show-on-canvas'
  | 'tidy'
  | 'tidy-row'
  | 'tidy-column'
  | 'tidy-wrap'
  | 'tidy-grid'
  | 'copy-page-name'
  | 'copy-page-link'
  | 'select-all'
  | 'zoom-fit'
  | 'zoom-100'
  | 'toggle-sidebar'
  | 'rename-page'
  | 'change-icon'
  | 'reorganize'
  | 'choose-icon'

export type MenuItem = {
  id: MenuItemId
  label: string
  shortcut?: string
  danger?: boolean
  note?: string
  children?: MenuItem[]
}

export const TIDY_ITEMS: MenuItem[] = [
  { id: 'tidy-row', label: 'In a row' },
  { id: 'tidy-column', label: 'In a column' },
  { id: 'tidy-wrap', label: 'Wrap', note: 'Reflows when the section is resized' },
  { id: 'tidy-grid', label: 'Grid…', note: 'Opens the controls in the right sidebar' },
]

export function canvasMenuGroups(input: { connected: boolean; sidebarShown: boolean }): MenuItem[][] {
  const { connected, sidebarShown } = input
  const groups: MenuItem[][] = [
    [
      { id: 'copy-page-name', label: 'Copy page name' },
      { id: 'copy-page-link', label: 'Copy page link' },
    ],
    [
      { id: 'select-all', label: 'Select all', shortcut: 'Ctrl+A' },
      { id: 'zoom-fit', label: 'Zoom to fit', shortcut: 'Shift+1' },
      { id: 'zoom-100', label: 'Zoom to 100%', shortcut: 'Shift+0' },
      { id: 'toggle-sidebar', label: sidebarShown ? 'Hide sidebar' : 'Show sidebar', shortcut: 'Ctrl+\\' },
    ],
    [
      { id: 'rename-page', label: 'Rename page' },
      { id: 'change-icon', label: 'Change icon…' },
    ],
    connected
      ? [
          { id: 'reorganize', label: 'Reorganize frames with agent' },
          { id: 'choose-icon', label: 'Choose icon with agent' },
        ]
      : [],
  ]
  return groups.filter((group) => group.length > 0)
}

type MenuBoard = {
  name: string
  section?: string | undefined
  interactive?: boolean | undefined
  variantOf?: string | undefined
}

export const pendingNames = (
  names: string[],
  stateOf: (name: string) => ApprovalState | undefined,
): string[] => {
  const { changed, added } = pendingOf(names, stateOf)
  return [...changed, ...added]
}

export function menuGroups(input: {
  names: string[]
  boards: MenuBoard[]
  sections: CanvasSection[]
  stateOf: (name: string) => ApprovalState | undefined
  connected: boolean
  wholeSection: string | null
  sidebar?: boolean
}): MenuItem[][] {
  const { names, boards, sections, stateOf, connected, wholeSection, sidebar = false } = input
  const [only] = names
  const single = names.length === 1 && wholeSection === null && only !== undefined
  const board = single ? boards.find((candidate) => candidate.name === only) : undefined
  const shared = sharedSection(names, boards)
  const target =
    wholeSection !== null
      ? 'section'
      : single
        ? 'frame'
        : typeof shared === 'string'
          ? 'part'
          : names.some((name) => boards.find((candidate) => candidate.name === name)?.section)
            ? 'mixed'
            : 'frames'

  const locate: MenuItem[] =
    sidebar && (target === 'frame' || target === 'section')
      ? [{ id: 'show-on-canvas', label: 'Show on canvas' }]
      : []

  const copy: MenuItem[] = [
    { id: 'copy', label: single ? 'Copy frame name' : `Copy ${names.length} frame names` },
  ]

  const frameItems: MenuItem[] = []
  if (target === 'frame') {
    if (board?.interactive) frameItems.push({ id: 'play', label: 'Play' })
    frameItems.push({ id: 'comment', label: 'Comment' })
  }

  const agentItems: MenuItem[] = []
  if (connected) {
    if (target === 'frame') {
      if (!board?.variantOf) agentItems.push({ id: 'variants', label: 'Generate variants' })
      if (only && pendingNames([only], stateOf).length > 0) {
        agentItems.push({ id: 'approve', label: 'Approve and build' })
      }
    } else {
      const pending = pendingNames(names, stateOf).length
      if (pending > 0) agentItems.push({ id: 'approve', label: `Approve ${pending} and build` })
    }
  }

  const direct =
    target === 'section' &&
    names.some((name) => boards.find((candidate) => candidate.name === name)?.section === wholeSection)
  const tidyItems: MenuItem[] =
    target === 'section' && direct
      ? [{ id: 'tidy', label: 'Tidy', children: TIDY_ITEMS }]
      : []

  const sectionItems: MenuItem[] = []
  const nestId = target === 'section' ? wholeSection : typeof shared === 'string' ? shared : null
  const nest: MenuItem = { id: 'create-sub-section', label: 'Create sub-section' }
  const remove: MenuItem = { id: 'remove-from-section', label: 'Remove from section' }
  const create: MenuItem = { id: 'create-section', label: 'Create section', shortcut: 'Shift+S' }
  if (target === 'frames') sectionItems.push(create)
  if (target === 'mixed') sectionItems.push(create, remove)
  if (target === 'part') {
    if (nestId !== null && canNest(nestId, sections)) sectionItems.push(nest)
    sectionItems.push(remove)
  }
  if (target === 'section') {
    sectionItems.push({ id: 'rename-section', label: 'Rename section' })
    if (direct && nestId !== null && canNest(nestId, sections)) sectionItems.push(nest)
    if (direct) sectionItems.push(remove)
    sectionItems.push({ id: 'delete-section', label: 'Delete section', danger: true })
  }

  return [locate, copy, frameItems, agentItems, tidyItems, sectionItems].filter((group) => group.length > 0)
}
