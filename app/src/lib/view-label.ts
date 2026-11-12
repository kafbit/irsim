import type { CommentView } from './comments-types'

export const DEVICE_PRESETS = [
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
  { id: 'large-phone', label: 'Large phone', width: 430, height: 932 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 800 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
] as const

const LABELS = new Map<string, string>([
  ...DEVICE_PRESETS.map((preset): [string, string] => [preset.id, preset.label]),
  ['fit', 'Fit window'],
  ['board', 'Board size'],
  ['responsive', 'Responsive'],
])

export const presetLabel = (id: string): string => LABELS.get(id) ?? id

export const viewLabel = (view: CommentView): string =>
  `${presetLabel(view.preset)} ${view.width} × ${view.height}`

export const viewportLine = (view: CommentView): string => {
  const scrolled = [
    ...(view.scrollX > 0 ? [`x ${view.scrollX}`] : []),
    ...(view.scrollY > 0 ? [`y ${view.scrollY}`] : []),
  ]
  const tail = scrolled.length > 0 ? `, scrolled to ${scrolled.join(', ')}` : ''
  return `viewport ${view.width} x ${view.height} (${presetLabel(view.preset)})${tail}`
}
