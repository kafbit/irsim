import { canNest, sharedSection } from './sections'
import type { CanvasSection } from './types'

export type MenuItemId =
  | 'ask-agent'
  | 'copy'
  | 'copy-name'
  | 'play'
  | 'comment'
  | 'variants'
  | 'section'
  | 'create-section'
  | 'rename-section'
  | 'create-sub-section'
  | 'remove-from-section'
  | 'delete-section'
  | 'show-on-canvas'
  | 'arrange'
  | 'page'
  | 'view'
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
  disabled?: boolean
  children?: MenuItem[]
}

export function canvasMenuGroups(input: { connected: boolean; sidebarShown: boolean }): MenuItem[][] {
  const { connected, sidebarShown } = input
  return [
    [
      { id: 'ask-agent', label: 'Ask the agent…', disabled: !connected },
      { id: 'reorganize', label: 'Reorganize frames with agent', disabled: !connected },
      { id: 'choose-icon', label: 'Choose icon with agent', disabled: !connected },
    ],
    [
      {
        id: 'page',
        label: 'Page',
        children: [
          { id: 'rename-page', label: 'Rename page' },
          { id: 'change-icon', label: 'Change icon…' },
          { id: 'copy-page-name', label: 'Copy page name' },
          { id: 'copy-page-link', label: 'Copy page link' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        children: [
          { id: 'select-all', label: 'Select all', shortcut: 'Ctrl+A' },
          { id: 'zoom-fit', label: 'Zoom to fit', shortcut: 'Shift+1' },
          { id: 'zoom-100', label: 'Zoom to 100%', shortcut: 'Shift+0' },
          { id: 'toggle-sidebar', label: sidebarShown ? 'Hide sidebar' : 'Show sidebar', shortcut: 'Ctrl+\\' },
        ],
      },
    ],
  ]
}

type MenuBoard = {
  name: string
  section?: string | undefined
  interactive?: boolean | undefined
  variantOf?: string | undefined
}

export function menuGroups(input: {
  names: string[]
  boards: MenuBoard[]
  sections: CanvasSection[]
  connected: boolean
  wholeSection: string | null
  sidebar?: boolean
}): MenuItem[][] {
  const { names, boards, sections, connected, wholeSection, sidebar = false } = input
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

  const ask: MenuItem = { id: 'ask-agent', label: 'Ask the agent…', disabled: !connected }
  const agentItems: MenuItem[] = [ask]
  if (target === 'frame' && connected && !board?.variantOf) {
    agentItems.push({ id: 'variants', label: 'Generate variants…' })
  }
  if (target === 'section') {
    agentItems.push({ id: 'reorganize', label: 'Reorganize with agent', disabled: !connected })
  }

  const frameItems: MenuItem[] = []
  if (target === 'frame') {
    if (board?.interactive) frameItems.push({ id: 'play', label: 'Play' })
    frameItems.push({ id: 'comment', label: 'Comment' })
  }

  const direct =
    target === 'section' &&
    names.some((name) => boards.find((candidate) => candidate.name === name)?.section === wholeSection)
  const nestId = target === 'section' ? wholeSection : typeof shared === 'string' ? shared : null
  const nest: MenuItem = { id: 'create-sub-section', label: 'Create sub-section' }
  const remove: MenuItem = { id: 'remove-from-section', label: 'Remove from section' }
  const create: MenuItem = { id: 'create-section', label: 'Create section', shortcut: 'Shift+S' }
  const sectionChildren: MenuItem[] = []
  if (target === 'frame') sectionChildren.push(board?.section ? remove : create)
  if (target === 'frames') sectionChildren.push(create)
  if (target === 'mixed') sectionChildren.push(create, remove)
  if (target === 'part') {
    if (nestId !== null && canNest(nestId, sections)) sectionChildren.push(nest)
    sectionChildren.push(remove)
  }
  if (target === 'section') {
    if (direct && nestId !== null && canNest(nestId, sections)) sectionChildren.push(nest)
    sectionChildren.push(
      { id: 'rename-section', label: 'Rename section' },
      { id: 'delete-section', label: 'Delete section', danger: true },
    )
  }

  const copyLabel =
    target === 'section' ? 'Copy section name' : single ? 'Copy frame name' : `Copy ${names.length} frame names`
  const arrange: MenuItem[] =
    target === 'section' ? [{ id: 'arrange', label: 'Arrange…', disabled: !direct }] : []
  const foot: MenuItem[] = [
    ...arrange,
    { id: 'section', label: 'Section', children: sectionChildren },
    { id: 'copy', label: 'Copy', children: [{ id: 'copy-name', label: copyLabel }] },
  ]

  return [locate, agentItems, frameItems, foot].filter((group) => group.length > 0)
}
