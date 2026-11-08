import { describe, expect, it } from 'vitest'
import { prepareSource } from '../public/runtime/parse.js'
import { stampLines } from '../public/runtime/stamp.js'

const board = [
  '<!doctype html>',
  '<html><head><script src="./support.js"></script></head>',
  '<body>',
  '<x-dc>',
  '<helmet>',
  '<style>.a > .b{color:red}</style>',
  '<div class="in-helmet"></div>',
  '</helmet>',
  '<div class="page">',
  '  <sc-for list="{{rows}}" as="row">',
  '    <span title="a > b">{{row.name}}</span>',
  '  </sc-for>',
  '  <dc-import name="Table"></dc-import>',
  '  <br/>',
  '  <sc-if value="{{open}}"><button>Go</button></sc-if>',
  '</div>',
  '<script type="text/x-dc" data-props="{}">',
  'const html = "<div>not a tag</div>"',
  '</script>',
  '</x-dc>',
  '<footer>outside</footer>',
  '</body></html>',
].join('\n')

const stamps = (source: string): [string, string][] =>
  [...source.matchAll(/<([a-z0-9-]+)\s[^>]*?data-dc-at="([^"]+)"/gi)].map((m) => [
    m[1] ?? '',
    m[2] ?? '',
  ])

describe('stampLines', () => {
  const out = stampLines(board, 'Leads')

  it('stamps each opening tag with the board and its line in the source', () => {
    expect(stamps(out)).toEqual([
      ['div', 'Leads:9'],
      ['span', 'Leads:11'],
      ['br', 'Leads:14'],
      ['button', 'Leads:15'],
    ])
  })

  it('keeps the number of lines', () => {
    expect(out.split('\n')).toHaveLength(board.split('\n').length)
  })

  it('leaves the control tags, helmet, script, style and x-dc alone', () => {
    expect(out).toContain('<x-dc>')
    expect(out).toContain('<helmet>')
    expect(out).toContain('<div class="in-helmet"></div>')
    expect(out).toContain('<style>')
    expect(out).toContain('<script type="text/x-dc" data-props="{}">')
    expect(out).toContain('<sc-for list="{{rows}}" as="row">')
    expect(out).toContain('<sc-if value="{{open}}">')
    expect(out).toContain('<dc-import name="Table">')
    expect(out).toContain('const html = "<div>not a tag</div>"')
  })

  it('changes nothing outside x-dc', () => {
    const [before] = out.split('<x-dc>')
    expect(before).toBe(board.split('<x-dc>')[0])
    expect(out.endsWith('</x-dc>\n<footer>outside</footer>\n</body></html>')).toBe(true)
  })

  it('puts the stamp right after the tag name and survives a quoted ">"', () => {
    expect(out).toContain('<span data-dc-at="Leads:11" title="a > b">')
    expect(out).toContain('<br data-dc-at="Leads:14"/>')
  })

  it('returns a source without x-dc untouched', () => {
    expect(stampLines('<div>plain</div>', 'Leads')).toBe('<div>plain</div>')
  })

  it('skips comments', () => {
    const source = '<x-dc>\n<!-- <div> -->\n<p>x</p>\n</x-dc>'
    expect(stamps(stampLines(source, 'B'))).toEqual([['p', 'B:3']])
  })
})

describe('prepareSource', () => {
  it('stamps before the control tags become templates', () => {
    const out = prepareSource(board, 'Leads')
    expect(out).toContain('<template data-sc="for" list="{{rows}}" as="row">')
    expect(out).toContain('<template data-sc="import" name="Table">')
    expect(out).toContain('<span data-dc-at="Leads:11"')
    expect(out.split('\n')).toHaveLength(board.split('\n').length)
  })

  it('does not stamp without a board name', () => {
    expect(prepareSource(board)).not.toContain('data-dc-at')
  })
})
