export type Preset = { label: string; part: string; direction: string }

export const PRESETS: Preset[] = [
  {
    label: 'Better',
    part: 'Better',
    direction:
      'Improve the overall quality of layout, hierarchy and polish while keeping the content.',
  },
  {
    label: 'Clearer',
    part: 'Clearer',
    direction: 'Make the purpose, labels and hierarchy easier to read and scan.',
  },
  {
    label: 'Simpler',
    part: 'Simpler',
    direction: 'Remove or merge elements and reduce visual noise to the essential.',
  },
  {
    label: 'Responsive',
    part: 'Responsive',
    direction: 'Make the board work from 390 px to its full width and show the narrow layout.',
  },
  {
    label: 'UI/UX pass',
    part: 'UiUxPass',
    direction:
      'Fix usability problems such as affordances, states, feedback, spacing and accessibility.',
  },
  {
    label: 'Research',
    part: 'Research',
    direction:
      'First look up current UI patterns for this kind of screen on the web, then apply the best fit and name the source in the reply.',
  },
]
