export const isWholeBoard = (place: { line: number }): boolean => !(place.line > 0)

export const placeText = (place: { file: string; line: number }): string =>
  isWholeBoard(place) ? place.file : `${place.file}:${place.line}`

export const targetText = (comment: {
  line: number
  element: { path: string; text: string }
}): string =>
  `${isWholeBoard(comment) ? 'board' : comment.element.path} "${comment.element.text}"`
