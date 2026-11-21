// @ts-check
/**
 * Links inside a board. `<a href="Cart.html">` (or the legacy `Cart.dc.html`) moves Play to the board `Cart`, and an `https:`
 * link opens a new tab, so the frame never loads another page. `#id` links keep their default:
 * they scroll inside the board. The canvas decides what a move means (see `use-play-links.ts`).
 */

const BOARD_LINK = /(?:^|\/)([A-Za-z][A-Za-z0-9]*)(?:\.dc)?\.html$/
const EXTERNAL = /^(?:https?:|mailto:|tel:)/i
// `https://site/Cart.html` or `//site/Cart.dc.html` is another site, not a board.
const OTHER_ORIGIN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * The board an `href` points at, or `null`. The href is relative to the board or starts at the
 * canvas root (`/sub/Cart.html`); only the file name picks the board, because irsim keeps every
 * board in one folder.
 * @param {string} href
 * @returns {string | null}
 */
export const boardOfHref = (href) => {
  const path = href.trim().split(/[?#]/)[0] ?? ''
  if (OTHER_ORIGIN.test(path)) return null
  return BOARD_LINK.exec(path)?.[1] ?? null
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export const isExternalHref = (href) => EXTERNAL.test(href.trim())

/**
 * Reads a click on a link. Comment mode stops the click before it gets here, so a pick never
 * follows a link.
 * @param {Document} doc
 * @param {(type: string, details?: unknown) => void} post
 */
export const installLinks = (doc, post) => {
  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    const target = /** @type {Element | null} */ (event.target)
    const link = target?.closest?.('a[href]')
    if (!link) return
    const href = link.getAttribute('href') ?? ''
    const board = boardOfHref(href)
    if (board) {
      event.preventDefault()
      post('navigate', { target: board })
      return
    }
    if (isExternalHref(href)) {
      event.preventDefault()
      post('open-url', { href: href.trim() })
    }
  })
}
