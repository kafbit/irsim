export const isWholeBoard = (place: { line: number }): boolean => place.line === 0

export const placeText = (place: { file: string; line: number }): string =>
  isWholeBoard(place) ? place.file : `${place.file}:${place.line}`

export const targetName = (comment: { line: number; element: { path: string } }): string =>
  isWholeBoard(comment) ? 'board' : comment.element.path

export const targetText = (comment: {
  line: number
  element: { path: string; text: string }
}): string =>
  comment.element.text
    ? `${targetName(comment)} "${comment.element.text}"`
    : targetName(comment)
