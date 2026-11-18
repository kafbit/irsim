import { describe, expect, it } from 'vitest'
import type { Comment } from '../src/lib/comments-types'
import { REPLY_RULE, buildPageRequestText, buildTurnText, buildVariantText } from '../src/lib/turn-text'

const comment = (overrides: Partial<Comment>): Comment => ({
  id: 'c_1',
  page: 'sales',
  board: 'Leads',
  file: 'design/Leads.dc.html',
  line: 57,
  element: { tag: 'button', path: 'button', text: 'عميل جديد' },
  rect: { x: 0, y: 0, width: 1, height: 1 },
  body: 'Use the primary button.',
  images: [],
  status: 'delivered',
  sessionId: 's1',
  batch: 'b_1',
  replies: [],
  createdAt: '2026-11-08T10:00:00.000Z',
  ...overrides,
})

describe('buildTurnText', () => {
  it('matches the contract format', () => {
    const text = buildTurnText([
      comment({
        id: 'c_a',
        file: 'design/Table.dc.html',
        line: 142,
        element: { tag: 'span', path: 'td.bt-row > span', text: 'خالد الشهري' },
        body: 'Make the name column wider.',
      }),
      comment({ id: 'c_b' }),
    ])
    expect(text).toBe(
      [
        'Design canvas: 2 comments on page sales (batch b_1). Read only the lines named. Boards live in design/.',
        '1. design/Table.dc.html:142 · td.bt-row > span "خالد الشهري" · on board Leads',
        '   Make the name column wider.',
        '2. design/Leads.dc.html:57 · button "عميل جديد"',
        '   Use the primary button.',
        'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
        REPLY_RULE,
        'Ids: c_a, c_b',
      ].join('\n'),
    )
  })

  it('names a whole-board comment by its file and the word board, without a line', () => {
    const text = buildTurnText([
      comment({
        file: 'design/Leads.dc.html',
        line: 0,
        element: { tag: 'board', path: '', text: 'Leads table' },
      }),
    ])
    expect(text.split('\n')[1]).toBe('1. design/Leads.dc.html · board "Leads table"')
    expect(text).not.toContain(':0')
  })

  it('builds the whole-board file from the design folder it is given', () => {
    const whole = comment({
      line: 0,
      element: { tag: 'board', path: '', text: 'Leads table' },
    })
    const text = buildTurnText([whole], {}, 'ui-boards')
    expect(text.split('\n')[1]).toBe('1. ui-boards/Leads.dc.html · board "Leads table"')
    expect(text).not.toContain('design/Leads.dc.html')
  })

  it('keeps the file of an element comment as stored', () => {
    expect(buildTurnText([comment({})], {}, 'ui-boards')).toContain(
      '1. design/Leads.dc.html:57 · button',
    )
  })

  it('explains a comment without a line only when one is in the batch', () => {
    const whole = comment({ line: 0, element: { tag: 'board', path: '', text: 'Leads' } })
    const sentence = 'A comment without a line is about the whole board, so read the board file as needed.'
    expect(buildTurnText([comment({})]).split('\n')[0]).not.toContain(sentence)
    expect(buildTurnText([comment({ id: 'c_2' }), whole]).split('\n')[0]).toContain(
      `Read only the lines named. ${sentence} Boards live in design/.`,
    )
  })

  it('leaves out the quoted text of an element with no text', () => {
    const text = buildTurnText([comment({ element: { tag: 'img', path: 'div > img', text: '' } })])
    expect(text.split('\n')[1]).toBe('1. design/Leads.dc.html:57 · div > img')
  })

  it('decides a whole-board comment by the line, not by the tag', () => {
    const text = buildTurnText([
      comment({ line: 0, element: { tag: 'div', path: 'div', text: 'Title' } }),
      comment({ id: 'c_2', line: 57, element: { tag: 'board', path: 'board', text: 'Title' } }),
    ])
    expect(text).toContain('1. design/Leads.dc.html · board "Title"')
    expect(text).toContain('2. design/Leads.dc.html:57 · board "Title"')
  })

  it('tells the agent to keep replies to three short sentences', () => {
    expect(REPLY_RULE).toBe(
      'Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.',
    )
    expect(buildTurnText([comment({})])).toContain(`\n${REPLY_RULE}\nIds: c_1`)
  })

  it('names the design folder it is given and defaults to design', () => {
    expect(buildTurnText([comment({})]).split('\n')[0]).toContain('Boards live in design/.')
    expect(buildTurnText([comment({})], {}, 'ui-boards').split('\n')[0]).toContain(
      'Boards live in ui-boards/.',
    )
  })

  it('says comment for one and indents every line of a multi-line body', () => {
    const text = buildTurnText([comment({ body: 'First line\nSecond line' })])
    expect(text.split('\n')[0]).toStartWith('Design canvas: 1 comment on page sales')
    expect(text).toContain('\n   First line\n   Second line\n')
  })

  it('names every page and batch when they differ', () => {
    const text = buildTurnText([
      comment({ id: 'c_a', page: 'sales', batch: 'b_1' }),
      comment({ id: 'c_b', page: 'inventory', batch: 'b_2' }),
    ])
    expect(text.split('\n')[0]).toContain('on pages sales, inventory (batches b_1, b_2)')
  })

  it('adds the viewport line right after the body and before the images', () => {
    const text = buildTurnText(
      [
        comment({
          images: ['i_a'],
          view: { width: 390, height: 844, preset: 'phone', scrollX: 0, scrollY: 1200 },
        }),
        comment({ id: 'c_2' }),
      ],
      { i_a: '/data/images/i_a.png' },
    )
    expect(text).toContain(
      '\n   Use the primary button.\n   viewport 390 x 844 (Phone), scrolled to y 1200\n   image: /data/images/i_a.png\n2. ',
    )
    expect(text.match(/viewport/g)).toHaveLength(1)
  })

  it('adds one image line per image that has a path', () => {
    const text = buildTurnText([comment({ images: ['i_a', 'i_b', 'i_gone'] })], {
      i_a: '/data/images/i_a.png',
      i_b: '/data/images/i_b.jpg',
    })
    expect(text).toContain(
      '\n   Use the primary button.\n   image: /data/images/i_a.png\n   image: /data/images/i_b.jpg\nReply to each',
    )
    expect(text).not.toContain('i_gone')
  })

  describe('follow-ups', () => {
    const at = '2026-11-08T11:00:00.000Z'
    const followUp = (overrides: Partial<Comment> = {}) =>
      comment({
        id: 'c_f',
        replies: [
          { author: 'user', body: 'First ask', at, seen: true },
          { author: 'claude', body: 'Done', at, seen: true },
          { author: 'user', body: 'Still wrong\nsecond line', at, seen: false },
        ],
        ...overrides,
      })

    it('renders the original body, earlier replies and the new reply', () => {
      const text = buildTurnText([followUp()])
      expect(text).toBe(
        [
          'Design canvas: 1 comment (0 new, 1 follow-up) on page sales (batch b_1). Read only the lines named. Boards live in design/.',
          '1. design/Leads.dc.html:57 · button "عميل جديد" · follow-up',
          '   Use the primary button.',
          '   You: First ask',
          '   Claude: Done',
          '   NEW You: Still wrong',
          '      second line',
          'Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.',
          REPLY_RULE,
          'Ids: c_f',
        ].join('\n'),
      )
    })

    it('lists the image path of a reply under its body', () => {
      const text = buildTurnText(
        [
          followUp({
            replies: [{ author: 'user', body: 'Look', at, seen: false, images: ['i_a', 'i_gone'] }],
          }),
        ],
        { i_a: '/data/images/i_a.png' },
      )
      expect(text).toContain('   NEW You: Look\n      image: /data/images/i_a.png\nReply to each')
      expect(text).not.toContain('i_gone')
    })

    it('names the agent that wrote a reply', () => {
      const text = buildTurnText([
        followUp({
          replies: [
            { author: 'claude', body: 'Done', at, seen: true, agent: 'opencode' },
            { author: 'user', body: 'Still wrong', at, seen: false },
          ],
        }),
      ])
      expect(text).toContain('   OpenCode: Done')
    })

    it('adds the count breakdown only when a follow-up exists', () => {
      const mixed = buildTurnText([comment({ id: 'c_a' }), followUp()])
      expect(mixed.split('\n')[0]).toContain('2 comments (1 new, 1 follow-up) on page sales')
      const fresh = buildTurnText([comment({ id: 'c_a' }), comment({ id: 'c_b' })])
      expect(fresh.split('\n')[0]).toStartWith('Design canvas: 2 comments on page sales')
    })

    it('notes a comment that was resolved', () => {
      const text = buildTurnText([followUp({ reopened: true })])
      expect(text).toContain(
        '· follow-up (was resolved, resolve it again if the new reply is handled)',
      )
    })

    it('keeps the image lines of the comment before the replies', () => {
      const text = buildTurnText([followUp({ images: ['i_a'] })], { i_a: '/data/i_a.png' })
      expect(text).toContain(
        '   Use the primary button.\n   image: /data/i_a.png\n   You: First ask',
      )
    })
  })
})

describe('buildVariantText', () => {
  it('names each variant file with its direction and ends with the reply rule once', () => {
    const text = buildVariantText([
      {
        id: 'v_1',
        page: 'sales',
        base: 'Leads',
        variants: [
          { name: 'LeadsVariantBetter', label: 'Better', direction: 'Improve it.' },
          { name: 'LeadsVariantSimpler', label: 'Simpler', direction: 'Cut it.' },
        ],
        note: 'Keep the filter.',
        sessionId: 's1',
        status: 'queued',
        createdAt: '2026-11-14T00:00:00.000Z',
      },
    ])
    expect(text).toBe(
      [
        'Design canvas: the user asked for 2 variants of board Leads (page sales). Each file below is a copy of design/Leads.dc.html; edit only that file.',
        '   design/LeadsVariantBetter.dc.html: Better. Improve it.',
        '   design/LeadsVariantSimpler.dc.html: Simpler. Cut it.',
        '   Keep the filter.',
        `   Keep each board's size and the board conventions. Run design_canvas {action: "check", board} on each and look at the screenshot. Do not edit Leads.dc.html; the user compares the variants and chooses one in irsim.`,
        REPLY_RULE,
      ].join('\n'),
    )
  })

  it('says where a free-form request came from and puts the note before the copies', () => {
    const text = buildVariantText([
      {
        id: 'v_2',
        page: 'sales',
        base: 'Leads',
        variants: [
          { name: 'LeadsVariantOption1', label: 'Option 1', direction: 'Option 1 of 2: a take.' },
          { name: 'LeadsVariantOption2', label: 'Option 2', direction: 'Option 2 of 2: a take.' },
        ],
        note: 'Calmer header.',
        pick: { file: 'design/Leads.dc.html', line: 7, element: { tag: 'h1', path: 'h1', text: 'Leads' } },
        sessionId: 's1',
        status: 'queued',
        createdAt: '2026-11-14T00:00:00.000Z',
      },
    ])
    expect(text).toBe(
      [
        'Design canvas: the user asked for 2 variants of board Leads (page sales) from a comment on design/Leads.dc.html:7 · h1 "Leads". Each file below is a copy of design/Leads.dc.html; edit only that file.',
        '   Calmer header.',
        '   design/LeadsVariantOption1.dc.html: Option 1. Option 1 of 2: a take.',
        '   design/LeadsVariantOption2.dc.html: Option 2. Option 2 of 2: a take.',
        `   Keep each board's size and the board conventions. Run design_canvas {action: "check", board} on each and look at the screenshot. Do not edit Leads.dc.html; the user compares the variants and chooses one in irsim.`,
        REPLY_RULE,
      ].join('\n'),
    )
  })

  it('lists the image paths of a request after the note', () => {
    const text = buildVariantText(
      [
        {
          id: 'v_3',
          page: 'sales',
          base: 'Leads',
          variants: [{ name: 'LeadsVariantOption1', label: 'Option 1', direction: 'Option 1 of 2: a take.' }],
          note: 'Like this.',
          images: ['i_a', 'i_gone'],
          sessionId: 's1',
          status: 'queued',
          createdAt: '2026-11-14T00:00:00.000Z',
        },
      ],
      'design',
      { i_a: '/data/images/i_a.png' },
    )
    expect(text).toContain('   Like this.\n   image: /data/images/i_a.png\n')
    expect(text).not.toContain('i_gone')
  })
})

describe('buildPageRequestText', () => {
  const request = (kind: 'icon' | 'reorganize') => ({
    id: 'p_1',
    page: 'sales',
    kind,
    sessionId: 's1',
    at: '2026-11-18T00:00:00.000Z',
    status: 'queued' as const,
  })

  it('asks for a Lucide icon and nothing else', () => {
    const text = buildPageRequestText([request('icon')], { sales: 'Sales' })
    expect(text).toContain('an icon for page Sales (sales)')
    expect(text).toContain('kebab-case')
    expect(text).toContain('"icon" on that page in design/canvas.json')
    expect(text.endsWith(REPLY_RULE)).toBe(true)
  })

  it('asks to tidy the page by editing only canvas.json', () => {
    const text = buildPageRequestText([request('reorganize')], { sales: 'Sales' })
    expect(text).toContain('tidy page Sales (sales)')
    expect(text).toContain('left to right in flow order')
    expect(text).toContain('Edit only design/canvas.json')
    expect(text).toContain('design_canvas {action: "check", page: "sales"}')
  })
})
