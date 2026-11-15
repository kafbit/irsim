export type Match = { score: number; positions: number[] }

const isUpper = (char: string): boolean => char !== char.toLowerCase()
const isAlnum = (char: string): boolean => /[\p{L}\p{N}]/u.test(char)

const isWordStart = (text: string, index: number): boolean => {
  if (index === 0) return true
  const previous = text[index - 1] as string
  const current = text[index] as string
  if (!isAlnum(previous)) return true
  if (isUpper(current) && !isUpper(previous)) return true
  return /\p{N}/u.test(current) !== /\p{N}/u.test(previous)
}

const PREFIX = 10000
const WORD_START = 5000

/**
 * Case-insensitive subsequence match. Higher scores are better: an exact prefix, then a match that
 * starts at a word start (spaces, `-`, `_`, camelCase boundaries), then an earlier start, then a
 * shorter text. Returns null when `query` is not a subsequence of `text`.
 */
export const match = (query: string, text: string): Match | null => {
  const needle = query.replace(/\s+/g, '').toLowerCase()
  if (!needle) return null
  const haystack = text.toLowerCase()
  const compact = query.trim().toLowerCase()
  if (haystack.startsWith(compact) && compact) {
    return { score: PREFIX - text.length, positions: Array.from({ length: compact.length }, (_, i) => i) }
  }
  let best: Match | null = null
  for (let start = 0; start < haystack.length; start++) {
    if (haystack[start] !== needle[0]) continue
    const positions = [start]
    let cursor = start + 1
    let wordStarts = isWordStart(text, start) ? 1 : 0
    for (let n = 1; n < needle.length; n++) {
      let found = -1
      for (let i = cursor; i < haystack.length; i++) {
        if (haystack[i] === needle[n] && isWordStart(text, i)) {
          found = i
          break
        }
      }
      if (found === -1) found = haystack.indexOf(needle[n] as string, cursor)
      else wordStarts++
      if (found === -1) {
        positions.length = 0
        break
      }
      positions.push(found)
      cursor = found + 1
    }
    if (positions.length !== needle.length) continue
    const lead = isWordStart(text, start) ? WORD_START : 0
    const score = lead + wordStarts * 100 - start * 10 - text.length
    if (!best || score > best.score) best = { score, positions }
    if (lead) break
  }
  if (best) return best
  const positions: number[] = []
  let cursor = 0
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor)
    if (found === -1) return null
    positions.push(found)
    cursor = found + 1
  }
  return { score: -(positions[0] as number) * 10 - text.length, positions }
}

/** The score of `match`, or null. */
export const score = (query: string, text: string): number | null => match(query, text)?.score ?? null

/** The items that match `query` in any of `fields`, best field score first. */
export const rank = <T>(items: T[], query: string, fields: (item: T) => string[]): T[] => {
  const scored: { item: T; value: number; order: number }[] = []
  items.forEach((item, order) => {
    let value: number | null = null
    for (const field of fields(item)) {
      const current = score(query, field)
      if (current !== null && (value === null || current > value)) value = current
    }
    if (value !== null) scored.push({ item, value, order })
  })
  return scored.sort((a, b) => b.value - a.value || a.order - b.order).map(({ item }) => item)
}
