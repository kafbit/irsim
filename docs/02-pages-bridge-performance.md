# 02 · Pages, session bridge, performance

Added 2026-11-08 at the user's request: open the canvas from Claude, send comments from the canvas back to the Claude session (the Plannotator pattern), give every artifact page its own isolated canvas, and make rendering cheaper.

## Measured baseline

Read in Chrome on 2026-11-08, dev server, cold cache.

| Measure | Value |
| --- | --- |
| Board requests for one `LeadDetail` frame | 11, in three import levels, about 400 KB |
| Root board downloads per frame | 2: the document, then `support.js` fetches it again |
| Duplicate import downloads | `Avatar` twice: `load()` marks a board only after its `await` |
| Imports finished | about 510 ms after navigation |
| `Cache-Control` on `/b/*` | `no-store`, so every frame downloads `Table` (85 KB) again |
| Pan | `setView` on every `pointermove` re-renders `Canvas` and recomputes the visible set |
| Frame leaves the viewport | iframe unmounts; coming back reloads all of the above and loses its state |
| Overview at zoom below 0.1 | grey placeholders only |

## A · Pages

```
/                 page index: 11 cards, board count, open comments, thumbnail strip
/p/<pageId>       one page's world: its boards only, its own view, fit-to-page on open
/p/<pageId>?board=<name>   same page, focused on one board
/b/<board>        the frame document (unchanged URL)
```

- A page route mounts only that page's frames: at most 39 instead of 181.
- The view (`x`, `y`, `k`) is kept per page in `sessionStorage`, so switching pages returns to where the reader was.
- `GET /api/pages/<pageId>` returns a compact manifest (board name, title, size, open comment count). The mod's tool returns it to Claude, so Claude never reads `canvas.json`.
- Minimum zoom drops to 0.02. A single page fits at that zoom, which the whole canvas did not.

## B · Session bridge

```
canvas (browser)                 canvas server (:3200)              Claude Code session
 comment mode: click element ──► POST /api/comments  (draft)
 "Send 3 comments"           ──► status: queued ──── poll every 2 s ◄── plugin design-canvas (plugins/design-canvas)
                                                     GET /api/comments?status=queued&session=<id>
                                                     ──► $.prompt.submit(one turn, all queued comments)
 thread shows reply          ◄── POST /api/comments/<id>/reply  ◄── tool design_canvas {action: reply}
```

- **Comment target.** `prepareSource` stamps every opening tag inside `<x-dc>` with `data-dc-at="<Board>:<line>"`, the line in `design/<Board>.dc.html`. A click in comment mode reads the nearest stamped ancestor, so an element inside an imported `Table` points at `Table.dc.html`, not the page board. The comment stores board, line, a short element path, its trimmed text (80 chars), its rect, and the page.
- **One turn per send, not per click.** Comments are drafts until the reader presses Send, as in a Plannotator review. The turn lists each comment as `design/Table.dc.html:142 · <td> "خالد الشهري" · <comment text>`, so Claude reads `sed -n 130,155p` of one file instead of the board.
- **Session targeting.** The mod registers its session id at `session.start` (`POST /api/sessions`). The canvas shows a session picker when more than one is registered, and remembers the choice per tab. A canvas opened by the mod carries `?session=<id>` and needs no pick.
- **Opening the canvas from Claude.** The local plugin `design-canvas` (`plugins/design-canvas/`, see the contract below) registers the commands `/canvas [page|board]`, `/canvas-stop` and `/canvas-comments`, and a `design_canvas` tool (`open`, `page`, `comments`, `reply`, `resolve`). `/canvas` checks `GET /api/health`, starts `bun run canvas` with `nohup` when it is down (the server outlives the session and serves every session), and opens the browser at the page route with `?session=<id>`.
- **Without the mod.** `bun run --cwd apps/design canvas:comments --wait` blocks until a send arrives and prints it as JSON, then marks it delivered. Any agent (OpenCode, Codex) can run it.
- **Storage.** `apps/design/.data/comments.json`, gitignored. Comments are review traffic, not design data, so they stay out of `design/`.
- **Hot reload.** The server watches `design/*.dc.html` and pushes `{board}` over `GET /api/events` (SSE). A frame reloads when the changed board is in its import closure, which the frame reports with `ready`. A publish that the canvas guard writes into `design/`, or a direct edit of `design/<Board>.dc.html`, shows up without a page reload. Boards stay unwritten by the canvas.

## C · Performance

Ordered by expected gain per change.

1. **One request per frame.** `/b/<board>` resolves the import closure on the server and embeds every source in `<script type="application/json" id="dc-bundle">`. `support.js` parses from it and fetches nothing. The response carries an `ETag` of the closure's mtimes and `Cache-Control: no-cache`, so a revisit is a 304. Removes the double root fetch and the `Avatar` race at the same time.
2. **Pan and zoom outside React.** Pointer and wheel handlers write the transform to the world element's `style` inside `requestAnimationFrame`. React state takes the view only when the gesture settles (100 ms idle), and only then recomputes the visible set.
3. **Mount queue.** At most 2 frames boot at once, nearest to the viewport centre first.
4. **Keep-alive with a cap.** A frame that leaves the viewport stays mounted and gets `visibility: hidden`. Past 16 live frames, the least recently visible unmounts. Panning back to a recent frame costs nothing and keeps its state.
5. **Thumbnails below zoom 0.25.** `bun run --cwd apps/design canvas:thumbs` renders each board with Playwright (`@playwright/test`, the version `apps/web` already pins, declared again in `apps/design`) to `apps/design/.data/thumbs/<board>.<hash>.webp`, the hash taken from the closure. The placeholder shows it, and the canvas never mounts an iframe below 0.25. A missing thumbnail falls back to the grey box. The hot-reload event marks a thumbnail stale.
6. **Measure, then decide on a shared parse cache.** Frames are same-origin, so the parent could hold parsed ASTs. Built only if parsing shows more than 30 ms per frame in a trace after 1 to 5.

## Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| A local plugin with a hooks module, `plugins/design-canvas/`, installed from the repo folder as a marketplace (user's choice, 2026-11-08) | Commands and a tool in one installable unit; read from the folder, so `/reload-plugins` picks up edits; `$.prompt.submit` gives a real turn once idle, which is what Plannotator does | Plannotator Inbox as transport: a second window and its own message format for a single-purpose loop |
| CLI fallback `canvas:comments --wait` | The previous session of this phase ran in OpenCode, which loads no Claude Code mods | Mod only |
| `data-dc-at` line stamps added at parse time | Claude gets `file:line` and reads 25 lines instead of a 100 KB board; no board is rewritten | Matching the clicked text back to the source: ambiguous on repeated rows |
| Batched Send | One turn per review, not per click; fewer tokens and no half-read feedback | Send on every comment |
| Comments in `apps/design/.data/`, gitignored | Review traffic is per machine and per session | In `design/canvas.json`: would be committed with the boards |
| Server-side bundle per frame | One request, cacheable, and no client race | HTTP/2 push, service worker: more moving parts for the same result |
| Thumbnails from Playwright | Makes the overview readable and costs no iframe | `html2canvas` in each frame: slow and inaccurate on SVG and `backdrop-filter` |

## Risks

- **Mods need Claude Code 2.1.287 or later, interactive.** `claude -p` and older builds get the CLI fallback only.
- **Plugin install** is one-time per machine: `claude plugin marketplace add ./plugins` then `claude plugin install design-canvas@bond`. `claude plugin validate plugins/design-canvas` runs in the plugin task.
- **Line stamps** add one attribute per element. Every `[data-…]` selector in `design/` names a specific attribute (`data-slot`, `data-state`, …), so none matches `data-dc-at`.
- **Thumbnails** are a Playwright run over 181 boards, about 2 to 3 minutes; it runs through `ajq`, on demand, never on canvas start.

## D · UI and UX

Added 2026-11-08 at the user's request ("better UI/UX and enhanced rendering"). Conventions taken from tldraw's camera, culling and performance docs and from Figma's shortcuts; Penpot's advice to split large files into pages backs §A.

### Layout

```
┌ pages ──────┐ ┌──────────── toolbar: Move · Hand · Comment ────────────┐ ┌ inspector ───┐
│ ● Sales  36 │ │                                                        │ │ Leads        │
│   Inventory │ │   Leads ─────────┐  LeadsEmpty ─────┐                  │ │ 1440 × 1500  │
│ ─ boards ── │ │   │  live frame  │  │  thumbnail    │                  │ │ design/Leads │
│ 🔍 search   │ │   └──────────────┘  └───────────────┘                  │ │ imports: 7   │
│ Leads       │ │                                       ┌ minimap ┐ 57% ▾│ │ Open alone   │
└─────────────┘ └───────────────────────────────────────┴─────────┴──────┘ └──────────────┘
```

- Left panel: pages with board counts, then the current page's boards with search. The selected board is highlighted and scrolled into view.
- Top toolbar: Move (`V`), Hand (`H`), Comment (`C`, wired in M2c).
- Bottom right: zoom menu (zoom in, zoom out, 50%, 100%, 200%, fit page, fit selection) and a minimap toggle.
- Right panel, only with a selection: board name and title, size, file path with copy, imported boards (each a link that focuses it), Open alone. M3's variables panel takes this slot when nothing is selected.

### Interaction

| Input | Action |
| --- | --- |
| Wheel / trackpad scroll | Pan |
| `Ctrl`/`Cmd` + wheel, pinch | Zoom around the pointer |
| Space + drag, middle drag, `H` | Pan |
| `Shift+1` / `Shift+2` / `Shift+0` | Fit page / fit selection / 100% |
| `+` / `-` | Next / previous zoom step: 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2 |
| `N` / `Shift+N` | Next / previous board in reading order, focused |
| `Enter` / `Esc` | Interact with the selected board / leave it, then deselect |
| `/` | Focus board search |
| Drag a frame title / drag a handle of the selected frame | Move / resize the frame (minimum 240 x 160), saved to `design/canvas.json`; `Esc` during the drag restores it |
| `Arrow` / `Shift+Arrow` | Nudge the selected frame by 10 / 50 units, saved after 400 ms |

- Camera moves from a button, a key or the list animate over 300 ms with ease-in-out cubic. Any pointer or wheel input stops the animation.
- Frame labels keep a constant screen size (counter-scaled by `1/k`) and hide below zoom 0.05.
- Selection and hover outlines are drawn in screen space, 2px and 1px, in the brand colour from `docs/15`.
- The background is a dot grid drawn with one CSS `background` on the viewport, its size and offset following the camera. It fades out below zoom 0.1.

### Rendering

- While a gesture runs the world element has `will-change: transform`. It is removed 150 ms after the gesture settles, so Chrome rasterises the frames again at the new zoom and text is sharp.
- A board's thumbnail stays under its iframe until the frame posts `ready`, then the iframe fades in over 120 ms. No blank frame between the two.
- The frame document carries the root board once: `/b/<board>` leaves the root out of `#dc-bundle`, and `support.js` reads the root from a `<template id="dc-root">` holding its raw source.
- Off-screen live frames get `content-visibility: hidden` in addition to `visibility: hidden`, so Chrome skips their layout and paint (tldraw hides culled shapes with `display: none` for the same reason; `display: none` on an iframe would reset some boards' measured layout).

### Sources

- [tldraw camera](https://tldraw.dev/sdk-features/camera), [tldraw culling](https://tldraw.dev/sdk-features/culling), [tldraw performance](https://tldraw.dev/sdk-features/performance)
- [Penpot community: performance on large files](https://community.penpot.app/t/slow-and-laggy-performance-any-tips-for-improving-the-performance/2572)
- [Fabric.js performance practices](https://hackernoon.com/lite/optimizing-performance-in-fabricjs-5-14-best-practices-and-tips)

## B contract (2026-11-08)

All under `http://localhost:${DESIGN_PORT:-3200}`. JSON in and out. Writes go to `apps/design/.data/` atomically (temp file, rename) through one in-process write queue.

```ts
type Comment = {
  id: string                     // c_<base36 time><4 random>
  page: string; board: string    // board = the frame it was made on
  file: string; line: number     // from data-dc-at: design/Table.dc.html, 142
  element: { tag: string; path: string; text: string }  // path: up to 4 tag[.class] steps; text trimmed to 80
  rect: { x: number; y: number; width: number; height: number }  // in the frame board's coordinates
  body: string
  status: 'draft' | 'queued' | 'delivered' | 'resolved'
  sessionId: string | null; batch: string | null
  replies: { author: 'claude' | 'user'; body: string; at: string }[]
  createdAt: string
}
type Session = { id: string; label: string; cwd: string; lastSeen: string }  // live while lastSeen < 30 s ago
```

| Route | Does |
| --- | --- |
| `GET /api/health` | `{ ok: true, version: 1, root }`, root = repository path |
| `POST /api/sessions` `{ id, label, cwd }` | Upsert, sets `lastSeen` |
| `GET /api/sessions` | Live sessions, newest first |
| `DELETE /api/sessions/<id>` | Remove |
| `GET /api/comments?status=&page=&board=&session=` | List, newest first |
| `POST /api/comments` `{ page, board, file, line, element, rect, body }` | New draft |
| `PATCH /api/comments/<id>` `{ body? , status?: 'resolved' }` | Edit a draft, or resolve |
| `DELETE /api/comments/<id>` | Drafts only, else 409 |
| `POST /api/comments/send` `{ sessionId, page? }` | Drafts (of the page, or all) → `queued` with one new `batch`; `{ batch, count }` |
| `POST /api/comments/claim` `{ sessionId }` | Sets `lastSeen`; takes that session's `queued` comments → `delivered`; `{ batch, count, text, comments }`, `count` 0 when none |
| `POST /api/comments/<id>/reply` `{ body, author }` | Appends a reply |
| `GET /api/events` | SSE: `event: board` `{ board }` when `design/<board>.dc.html` changes; `event: comments` `{ ids }` on any comment write |

`text` from `claim`, the turn the session receives, written once on the server so the plugin and the CLI agree:

```
Design canvas: 2 comments on page sales (batch b_…). Read only the lines named; boards live in design/.
1. design/Table.dc.html:142 · td.bt-row > span "خالد الشهري" · on board Leads
   Make the name column wider.
2. design/Leads.dc.html:57 · button "عميل جديد"
   Use the primary button.
Reply to each with design_canvas {action: "reply", id, body}; resolve with {action: "resolve", id}.
Ids: c_…, c_…
```

Plugin `plugins/design-canvas/`, marketplace `plugins/.claude-plugin/marketplace.json` (name `bond`):

| Piece | Behaviour |
| --- | --- |
| `/canvas [page or board]` | Health check; if down, `sh -c 'nohup bun run canvas > apps/design/.data/canvas.log 2>&1 &'` from the repo root and wait up to 30 s; register the session; turn listening on; open `…/p/<page>?board=<b>&session=<id>` with `xdg-open` or `open`; answer one line |
| `/canvas-stop` | Listening off, session removed |
| `/canvas-comments` | Counts of open comments per page, no turn |
| Poll | Every 2 s while listening: `claim`; `count > 0` → `$.prompt.submit({ text })`. A down server is skipped quietly; status line `canvas · listening` |
| Tool `design_canvas` | `open {page?, board?}`, `page {page}` (the compact manifest), `comments {status?, page?}`, `reply {id, body}`, `resolve {id, body?}` (reply, then resolve) |

CLI `bun run --cwd apps/design canvas:comments`: `--wait` registers session `cli`, claims every 2 s and prints the first non-empty claim as JSON, then exits; `--list [--status s]`; `--reply <id> <body>`; `--resolve <id>`.
