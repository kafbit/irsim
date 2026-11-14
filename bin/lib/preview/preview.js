;(() => {
  'use strict'

  const DATA = window.__IRSIM_PREVIEW__ || {}
  const PAGES = Array.isArray(DATA.pages) ? DATA.pages : []

  const sidebar = document.getElementById('pv-sidebar')
  const main = document.getElementById('pv-main')
  const backdrop = document.getElementById('pv-backdrop')

  /**
   * @param {string} tag
   * @param {Record<string, unknown>} [props]
   * @param {...(Node | string | number | null | undefined | false)} children
   */
  const el = (tag, props, ...children) => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue
      if (key === 'text') node.textContent = String(value)
      else if (key === 'class') node.className = String(value)
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value)
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value)
      } else node.setAttribute(key, value === true ? '' : String(value))
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue
      node.append(child instanceof Node ? child : document.createTextNode(String(child)))
    }
    return node
  }

  const frameUrl = (name) => `b/${encodeURIComponent(name)}.html`
  const boardHash = (name, pageId) =>
    pageId
      ? `#/board/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
      : `#/board/${encodeURIComponent(name)}`
  const pageHash = (id) => `#/page/${encodeURIComponent(id)}`
  const number = (value, fallback) => (Number.isFinite(value) ? value : fallback)
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const live = new Map()
  let activeQueue = null

  /** Maps an iframe's window to its card, so a message is read only from a frame we mounted. */
  const track = (frame, entry) => {
    const register = () => {
      if (frame.contentWindow) live.set(frame.contentWindow, entry)
    }
    frame.addEventListener('load', register)
    register()
  }

  /** Starts at most `limit` board frames at once, then one more for each frame that settles. */
  const createMountQueue = (limit) => {
    const waiting = []
    let active = 0
    let cancelled = false
    const next = () => {
      if (cancelled) return
      while (active < limit && waiting.length > 0) {
        const start = waiting.shift()
        if (!start) return
        active += 1
        start(() => {
          active -= 1
          next()
        })
      }
    }
    return {
      add(start) {
        waiting.push(start)
      },
      start: next,
      cancel() {
        cancelled = true
        waiting.length = 0
      },
    }
  }

  const menuButton = () =>
    el('button', {
      class: 'pv-menu',
      type: 'button',
      'aria-label': 'Show boards',
      onclick: () => document.body.classList.toggle('pv-menu-open'),
    }, '☰')

  const closeMenu = () => document.body.classList.remove('pv-menu-open')

  const chip = (text) => el('span', { class: 'pv-chip', text })

  const report = (() => {
    const node = el('div', { class: 'pv-toast', role: 'status', hidden: true })
    document.body.append(node)
    let timer
    return (message) => {
      node.textContent = message
      node.hidden = false
      clearTimeout(timer)
      timer = setTimeout(() => { node.hidden = true }, 3000)
    }
  })()

  const zoomBar = (onStep, onFit, onActual) => {
    const label = el('span', { text: '100%' })
    const node = el(
      'div',
      { class: 'pv-zoom' },
      el('button', { type: 'button', 'aria-label': 'Zoom out', text: '−', onclick: () => onStep(1 / 1.2) }),
      label,
      el('button', { type: 'button', 'aria-label': 'Zoom in', text: '+', onclick: () => onStep(1.2) }),
      el('button', { type: 'button', text: 'Fit', onclick: onFit }),
      el('button', { type: 'button', text: '100%', onclick: onActual }),
    )
    return { node, set: (scale) => { label.textContent = `${Math.round(scale * 100)}%` } }
  }

  const boundsOf = (boards) => {
    if (boards.length === 0) return { x: 0, y: 0, width: 960, height: 640 }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const board of boards) {
      minX = Math.min(minX, number(board.x, 0))
      minY = Math.min(minY, number(board.y, 0) - 28)
      maxX = Math.max(maxX, number(board.x, 0) + number(board.width, 1440))
      maxY = Math.max(maxY, number(board.y, 0) + number(board.height, 900))
    }
    const pad = 32
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    }
  }

  const boardCard = (board, bounds, page, queue) => {
    const width = number(board.width, 1440)
    const height = number(board.height, 900)
    const title = board.title || board.name
    const frame = el('iframe', { title, loading: 'lazy' })
    const veil = el('div', { class: 'pv-veil', text: 'Loading board…' })
    const body = el('div', { class: 'pv-body' }, frame, veil)
    const open = el(
      'button',
      {
        type: 'button',
        title: `Open ${board.name}`,
        onclick: () => { location.hash = boardHash(board.name, page.id) },
      },
      el('span', { class: 'pv-cap-title', text: title }),
      el('span', { class: 'pv-cap-name', text: board.name }),
    )
    const card = el(
      'figure',
      { class: 'pv-frame' },
      el('figcaption', { class: 'pv-cap' }, el('span', { class: 'pv-cap-state' }), open),
      body,
    )
    card.style.left = `${number(board.x, 0) - bounds.x}px`
    card.style.top = `${number(board.y, 0) - 28 - bounds.y}px`
    card.style.width = `${width}px`
    card.style.height = `${height + 28}px`

    let release = () => {}
    const entry = {
      board,
      ready() {
        card.classList.add('is-ready')
        card.classList.remove('is-error')
        release()
      },
      error(message) {
        card.classList.add('is-error')
        card.classList.remove('is-ready')
        veil.textContent = message || 'This board failed to render'
        release()
      },
    }
    track(frame, entry)
    queue.add((done) => {
      let settled = false
      let timer = 0
      release = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        done()
      }
      timer = setTimeout(release, 8000)
      frame.src = frameUrl(board.name)
    })
    return card
  }

  const empty = (message) => el('div', { class: 'pv-empty', text: message })

  const renderPage = (page) => {
    const boards = Array.isArray(page.boards) ? page.boards : []
    const bounds = boundsOf(boards)
    const stage = el('div', { class: 'pv-stage' })
    const sizer = el('div', { class: 'pv-sizer' })
    const world = el('div', { class: 'pv-world' })
    world.style.width = `${bounds.width}px`
    world.style.height = `${bounds.height}px`
    const queue = createMountQueue(6)
    for (const board of boards) world.append(boardCard(board, bounds, page, queue))
    sizer.append(world)
    stage.append(sizer)

    let scale = 1
    let fitted = true

    const apply = () => {
      world.style.transform = `scale(${scale})`
      sizer.style.width = `${bounds.width * scale}px`
      sizer.style.height = `${bounds.height * scale}px`
      zoom.set(scale)
    }

    const fit = () => {
      fitted = true
      const available = stage.clientWidth - 64
      scale = clamp(Math.min(1, available / bounds.width), 0.02, 2)
      apply()
    }

    const step = (factor) => {
      fitted = false
      scale = clamp(scale * factor, 0.02, 2)
      apply()
    }

    const actual = () => {
      fitted = false
      scale = 1
      apply()
    }

    const zoom = zoomBar(step, fit, actual)

    const bar = el(
      'div',
      { class: 'pv-bar' },
      menuButton(),
      el('h1', {}, el('span', { text: page.title })),
      chip(`${boards.length} ${boards.length === 1 ? 'board' : 'boards'}`),
      el('span', { class: 'pv-spacer' }),
      zoom.node,
    )

    main.append(bar, stage)
    activeQueue = queue
    requestAnimationFrame(() => {
      zoom.set(1)
      fit()
      queue.start()
    })
    resizeHandlers.push(() => fitted && fit())
  }

  const renderBoard = (entry) => {
    const { board, page } = entry
    const width = number(board.width, 1440)
    const height = number(board.height, 900)
    const title = board.title || board.name
    const stage = el('div', { class: 'pv-board-stage' })
    const sizer = el('div', { class: 'pv-sizer' })
    const world = el('div', { class: 'pv-board-world' })
    world.style.width = `${width}px`
    world.style.height = `${height}px`
    const frame = el('iframe', { src: frameUrl(board.name), title, width: '100%', height: '100%' })
    track(frame, { board, ready() {}, error() {} })
    world.append(frame)
    sizer.append(world)
    stage.append(sizer)

    let scale = 1
    let fitted = true

    const apply = () => {
      world.style.transform = `scale(${scale})`
      sizer.style.width = `${width * scale}px`
      sizer.style.height = `${height * scale}px`
      zoom.set(scale)
    }

    const fit = () => {
      fitted = true
      const availableWidth = stage.clientWidth - 48
      const availableHeight = stage.clientHeight - 48
      scale = clamp(Math.min(1, availableWidth / width, availableHeight / height), 0.02, 2)
      apply()
    }

    const step = (factor) => {
      fitted = false
      scale = clamp(scale * factor, 0.02, 2)
      apply()
    }

    const actual = () => {
      fitted = false
      scale = 1
      apply()
    }

    const zoom = zoomBar(step, fit, actual)

    const bar = el(
      'div',
      { class: 'pv-bar' },
      menuButton(),
      el('a', { class: 'pv-back', href: pageHash(page.id) }, '← ', page.title),
      el('h1', { text: title }),
      chip(board.name),
      chip(`${width} × ${height}`),
      el('span', { class: 'pv-spacer' }),
      el('a', {
        class: 'pv-frame-link',
        href: frameUrl(board.name),
        target: '_blank',
        rel: 'noopener',
        text: 'Open frame',
      }),
      zoom.node,
    )

    main.append(bar, stage)
    requestAnimationFrame(() => {
      zoom.set(1)
      fit()
    })
    resizeHandlers.push(() => fitted && fit())
  }

  let resizeHandlers = []

  const route = () => {
    const raw = location.hash.replace(/^#\/?/, '')
    const slash = raw.indexOf('/')
    const kind = slash === -1 ? raw : raw.slice(0, slash)
    const parts = (slash === -1 ? '' : raw.slice(slash + 1)).split('/').map(decodeURIComponent)
    if (kind === 'board') {
      const item =
        parts.length >= 2
          ? boardByPage.get(`${parts[0]}\0${parts[1]}`)
          : boardIndex.get(parts[0])
      if (item) return { view: 'board', name: item.board.name, entry: item }
    }
    if (kind === 'page') {
      const page = PAGES.find((candidate) => candidate.id === parts[0])
      if (page) return { view: 'page', page }
    }
    return { view: 'page', page: PAGES[0] }
  }

  const activePageId = (next) =>
    next.view === 'board' ? next.entry.page.id : next.page ? next.page.id : null

  const setActive = (next) => {
    const pageId = activePageId(next)
    for (const [id, row] of pageRows) row.classList.toggle('is-active', id === pageId)
    for (const item of entries) {
      item.row.classList.toggle('is-active', next.view === 'board' && item === next.entry)
    }
  }

  const render = () => {
    if (activeQueue) {
      activeQueue.cancel()
      activeQueue = null
    }
    live.clear()
    resizeHandlers = []
    closeMenu()
    const next = route()
    setActive(next)
    main.replaceChildren()
    if (!PAGES.length) {
      main.append(empty('No pages: add boards to the design folder and run irsim build first.'))
      return
    }
    if (next.view === 'board') renderBoard(next.entry)
    else if (next.page) renderPage(next.page)
    else main.append(empty('No page found.'))
  }

  const nav = el('nav', { class: 'pv-nav' })
  const search = el('input', {
    class: 'pv-search',
    type: 'search',
    placeholder: 'Filter boards',
    'aria-label': 'Filter boards',
  })
  const boardCount = PAGES.reduce((sum, page) => sum + (page.boards || []).length, 0)
  const brand = el(
    'div',
    { class: 'pv-brand' },
    el('div', { class: 'pv-title', text: DATA.title || 'irsim preview' }),
    el('div', {
      class: 'pv-meta',
      text: `${PAGES.length} ${PAGES.length === 1 ? 'page' : 'pages'} · ${boardCount} ${boardCount === 1 ? 'board' : 'boards'}`,
    }),
  )
  sidebar.append(brand, search, nav)

  const pageRows = new Map()
  const entries = []
  const boardIndex = new Map()
  const boardByPage = new Map()

  for (const page of PAGES) {
    const row = el(
      'button',
      { class: 'pv-page-row', type: 'button', onclick: () => { location.hash = pageHash(page.id) } },
      el('span', { text: page.title }),
      el('span', { class: 'pv-count', text: String((page.boards || []).length) }),
    )
    nav.append(row)
    pageRows.set(page.id, row)
    for (const board of page.boards || []) {
      const boardRow = el(
        'button',
        {
          class: 'pv-board-row',
          type: 'button',
          onclick: () => { location.hash = boardHash(board.name, page.id) },
        },
        el('span', { class: 'pv-board-label', text: board.title || board.name }),
        el('span', { class: 'pv-board-name', text: board.name }),
      )
      nav.append(boardRow)
      const item = { page, board, row: boardRow }
      entries.push(item)
      if (!boardIndex.has(board.name)) boardIndex.set(board.name, item)
      boardByPage.set(`${page.id}\0${board.name}`, item)
    }
  }

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    const visible = new Set()
    for (const item of entries) {
      const matches =
        !query ||
        String(item.board.title || '').toLowerCase().includes(query) ||
        item.board.name.toLowerCase().includes(query)
      item.row.style.display = matches ? '' : 'none'
      if (matches) visible.add(item.page.id)
    }
    for (const [id, row] of pageRows) row.style.display = visible.has(id) ? '' : 'none'
  })

  backdrop.addEventListener('click', closeMenu)

  window.addEventListener('hashchange', render)
  window.addEventListener('resize', () => {
    for (const handler of resizeHandlers) handler()
  })

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return
    const data = event.data
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
    const item = live.get(event.source)
    if (!item) return
    if (data.type === 'navigate') {
      const target = data.details && data.details.target
      const destination = typeof target === 'string' ? boardIndex.get(target) : undefined
      if (typeof target === 'string' && destination) {
        location.hash = boardHash(destination.board.name, destination.page.id)
      } else if (typeof target === 'string') {
        report(`No board named ${target}`)
      }
      return
    }
    if (data.type === 'open-url') {
      const href = data.details && data.details.href
      if (typeof href === 'string' && /^(?:https?:|mailto:|tel:)/i.test(href)) {
        window.open(href, '_blank', 'noopener')
      }
      return
    }
    if (data.type === 'ready') item.ready()
    else if (data.type === 'error') item.error(data.details && data.details.message)
  })

  render()

  if (location.protocol === 'file:') {
    report('Serve this folder over HTTP: browsers block the board modules on file://')
  }
})()
