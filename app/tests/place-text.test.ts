import { describe, expect, it } from 'vitest'
import { isWholeBoard, placeText, targetName, targetText } from '../src/lib/place-text'

const target = (line: number, tag: string, path: string, text: string) => ({
  file: 'design/Leads.dc.html',
  line,
  element: { tag, path, text },
})

describe('place-text', () => {
  it('decides a whole-board comment by the line, not by the tag', () => {
    expect(isWholeBoard(target(0, 'div', 'div', 'Title'))).toBe(true)
    expect(isWholeBoard(target(57, 'board', 'board', 'Title'))).toBe(false)
    expect(isWholeBoard(target(142, 'span', 'td > span', 'Name'))).toBe(false)
  })

  it('shows the file alone for line 0 and file:line otherwise', () => {
    expect(placeText(target(0, 'div', 'div', 'Title'))).toBe('design/Leads.dc.html')
    expect(placeText(target(57, 'board', 'board', 'Title'))).toBe('design/Leads.dc.html:57')
    expect(placeText(target(142, 'span', 'td > span', 'Name'))).toBe('design/Leads.dc.html:142')
  })

  it('names a whole-board comment board and any other one by its element path', () => {
    expect(targetText(target(0, 'div', 'div', 'Title'))).toBe('board "Title"')
    expect(targetText(target(57, 'board', 'board', 'Title'))).toBe('board "Title"')
    expect(targetText(target(142, 'span', 'td > span', 'Name'))).toBe('td > span "Name"')
  })

  it('leaves out the quoted text when the element has none', () => {
    expect(targetText(target(0, 'board', '', ''))).toBe('board')
    expect(targetText(target(142, 'img', 'div > img', ''))).toBe('div > img')
    expect(targetName(target(142, 'img', 'div > img', 'x'))).toBe('div > img')
  })

  it('treats only line 0 as a whole board', () => {
    expect(isWholeBoard(target(-1, 'div', 'div', 'Title'))).toBe(false)
    expect(isWholeBoard(target(Number.NaN, 'div', 'div', 'Title'))).toBe(false)
  })
})
