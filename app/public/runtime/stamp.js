// @ts-check
const UNSTAMPED = new Set(['x-dc', 'helmet', 'sc-for', 'sc-if', 'dc-import', 'script', 'style'])
const OPAQUE = new Set(['script', 'style', 'helmet'])
const TAG_NAME = /<([A-Za-z][^\s/>]*)/y

/**
 * @param {string} source
 * @param {number} from
 * @returns {number} the index of the `>` that ends the tag, skipping quoted attribute values
 */
const tagEnd = (source, from) => {
  let quote = ''
  for (let i = from; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '>') return i
  }
  return -1
}

/**
 * Mark every opening tag inside `<x-dc>` with the board and line it came from, so a click in
 * comment mode can name `design/<Board>.dc.html:<line>`. Control tags, `<helmet>`, `<script>` and
 * `<style>` (and what they hold) are left alone. Lines are counted in the untouched source.
 *
 * @param {string} source
 * @param {string} board
 * @returns {string}
 */
export const stampLines = (source, board) => {
  const open = source.search(/<x-dc[\s>]/)
  const close = source.lastIndexOf('</x-dc>')
  if (open < 0 || close < open) return source
  let out = ''
  let copied = 0
  let line = 1
  let counted = 0
  let at = tagEnd(source, open) + 1
  while (at > 0 && at < close) {
    const lt = source.indexOf('<', at)
    if (lt < 0 || lt >= close) break
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      at = end < 0 ? close : end + 3
      continue
    }
    TAG_NAME.lastIndex = lt
    const match = TAG_NAME.exec(source)
    if (!match) {
      at = lt + 1
      continue
    }
    const name = (match[1] ?? '').toLowerCase()
    const nameEnd = lt + match[0].length
    if (OPAQUE.has(name)) {
      const closing = new RegExp(`</${name}\\s*>`, 'ig')
      closing.lastIndex = nameEnd
      const end = closing.exec(source)
      at = end ? end.index : close
      continue
    }
    if (!UNSTAMPED.has(name)) {
      for (let i = source.indexOf('\n', counted); i >= 0 && i < lt; i = source.indexOf('\n', i + 1))
        line++
      counted = lt
      out += `${source.slice(copied, nameEnd)} data-dc-at="${board}:${line}"`
      copied = nameEnd
    }
    const end = tagEnd(source, nameEnd)
    at = end < 0 ? close : end + 1
  }
  return out + source.slice(copied)
}
