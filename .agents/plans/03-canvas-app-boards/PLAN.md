# 03 · boards for the irsim canvas app

## Goal

`design/` holds boards that draw the irsim canvas app itself: its parts, the states of a frame, and whole-screen compositions. They match the running app (`app/src/canvas/*.tsx`, tokens in `app/src/app/ui-tokens.css` and `globals.css`).

## Conventions for every board

- Reference for structure and style: `design/UpdateNotice.dc.html` (read it first). English only: `<html lang="en" dir="ltr">` and `dir="ltr" lang="en"` on the root div.
- Root div: `class="cv-root {{themeClass}}"` with `min-height: 100vh` (never `height: 100%`), font `system-ui, sans-serif`.
- Tokens: a `<style>` in `<helmet>` defines the CSS variables on `.cv-root` and redefines them on `.cv-root.dark`, copied from `app/src/app/ui-tokens.css` (light) and `app/src/app/globals.css` `:root[data-theme='dark']` (dark). Use only `var(--token)` in inline styles: `--background --foreground --card --secondary --muted-foreground --accent --border --border-strong --primary --primary-foreground --destructive --success --success-foreground --warning --warning-foreground --info --info-foreground --highlight --shell --surface --input --ring`. Blue for Play and focus is `#2563eb` (Tailwind blue-600), hover `#1d4ed8`, in dark `#60a5fa` for text.
- Every board has a `theme` prop (`light` | `dark`, default `light`) and `themeClass` = `'dark'` or `''`. A board that imports another passes `theme="{{theme}}"` down.
- Props are `data-props` JSON with `editor`, `default`, `options` (see UpdateNotice). Add `"$preview":{"width":W,"height":H}`.
- Imports: `<dc-import name="CanvasToolbar" tool="move" theme="{{theme}}" hint-size="200px,48px"></dc-import>`. A prop passed through `dc-import` as a string attribute is coerced to the child's declared prop type. Read `app/public/runtime/parse.js` around `dc-import` if unsure.
- Icons: draw small inline SVG (lucide style, 16px, stroke `currentColor`, stroke-width 2, no fill) for the cursor, hand, message square, map, chevron down, play (filled triangle), check, copy, x.
- Floating panels use `box-shadow: 0 14px 36px rgba(20,22,26,0.14)`, radius 12px, border `1px solid var(--border)`, background `var(--card)`.
- Plain literal English text, no emoji.

## Boards and props (the contract between workers)

| Board | Props (default first) | What it draws |
|---|---|---|
| `CanvasSidebar` | `theme`, `page` (`Components`\|`Home`), `selected` (`Button`\|`none`), `search` (text, default empty), `update` (`none`\|`available`) | The 288 px sidebar of `sidebar.tsx`: "All pages" link, page rows with board counts (current page `bg-secondary` and medium weight), search input, "N boards" line, board rows (selected row `bg-secondary`; each row has the board title and a small trailing icon button as in `BoardRow`), and at the bottom the update card of `design/UpdateNotice.dc.html` in its `available` state when `update=available`. Empty search shows all boards; a search that matches nothing shows "No boards match". |
| `CanvasPages` | `theme`, `count` (`3`\|`0`) | The page index of `page-index.tsx`: "Pages" heading and a grid of page cards (title, board count, board name chips); `count=0` shows "No canvas pages yet." |
| `CanvasInspector` | `theme`, `approval` (`none`\|`approved`\|`changed`\|`queued`), `imports` (`3`\|`0`) | The 288 px inspector of `inspector.tsx` plus the approve box of `approvals/approve-box.tsx`: name, title, size, file path with copy button, imports list, the Approval section (badge, note textarea, session picker, "Approve and build" button, status line), "Open alone" button. |
| `CanvasToolbar` | `theme`, `tool` (`move`\|`hand`\|`comment`) | The floating pill of `toolbar.tsx`: Move, Hand, Comment icon buttons (active one `bg-secondary`), a 1 px divider, and the Play menu button. |
| `CanvasZoomBar` | `theme`, `zoom` (`100`\|`50`\|`25`\|`200`), `minimap` (`off`\|`on`), `menu` (`closed`\|`open`) | The bottom-right cluster of `view-controls.tsx`: optional minimap card (frames as small rects, a viewport rect) above a pill with the minimap toggle and the "N%" zoom button; `menu=open` draws the zoom menu above it (items of `view-controls.tsx`). |
| `CanvasFocusBar` | `theme`, `title` (`Reservations`) | The bar of `focus-bar.tsx`: "<title> is focused", "Esc to exit", blue Exit button, blue border. |
| `CanvasToast` | `theme`, `message` | The toast of `toast.tsx` (destructive text). |
| `CanvasThread` | `theme`, `state` (`open`\|`resolved`\|`empty`) | The 320 px comments panel of `comments/thread-panel.tsx` and `comment-card.tsx`: header "Comments (N)", grouped sections, comment cards (author, time, body, status), the reply form; `empty` shows the empty text. Read both files for the real texts. |
| `CanvasFrame` | `theme`, `state` (`live`\|`selected`\|`thumbnail`\|`pending`\|`failed`\|`playing`\|`commenting`), `prototype` (`no`\|`yes`), `approval` (`none`\|`approved`\|`changed`), `width` (`360`) , `height` (`240`) | One board frame as `frame.tsx` draws it: the title row above (optional blue prototype dot, Approved / Changed word, bold title, muted name), the Play chip at the top end when `prototype=yes` (Stop chip, blue, when `playing`), the white rounded 12 px body with a 1 px border outline (2 px blue when `playing`), and the content per state: `live` a small mock page; `selected` the same with a 2 px `var(--ring)` outline and 4 small square handles; `thumbnail` the mock drawn as a flat image; `pending` a `var(--secondary)` fill with the board name centered and a pulsing animation; `failed` the same fill, the name, no pulse; `commenting` live plus two numbered round comment pins (24 px, one with a small highlight dot). |
| `CanvasApp` | `theme`, `state` (`overview`\|`selected`\|`zoomedOut`\|`thumbnailsLoading`\|`playing`\|`commenting`\|`toast`\|`emptyPage`), `update` (`none`\|`available`) | The whole screen, 1440 x 900: `CanvasSidebar` left, the viewport (background `var(--shell)`, subtle dot grid) in the middle with page label, `CanvasToolbar` centered at the top, `CanvasZoomBar` at the bottom end, several `CanvasFrame`s placed at canvas positions, and per state: `selected` adds the `CanvasInspector` on the end side; `zoomedOut` shows 12 small frames as thumbnails and zoom 20%; `thumbnailsLoading` mixes `pending` and `thumbnail` frames; `playing` has one `playing` frame and the `CanvasFocusBar`; `commenting` has the comment tool active, pins, and `CanvasThread` at the end; `toast` adds a `CanvasToast`; `emptyPage` shows "No boards match" style empty viewport text. |

`hint-size` for imports: sidebar `288px,820px`, inspector `288px,820px`, thread `320px,820px`, toolbar `220px,48px`, zoombar `260px,200px`, focusbar `380px,40px`, toast `420px,44px`, frame as its own `width`/`height` plus 40px of title row.

## Registration

After the boards exist, `node bin/irsim build` adds them to `design/canvas.json` as unsorted. The coordinator moves them to a page `canvas-app` with positions.

## Checks

For each board: `curl -s -X POST http://localhost:3285/api/boards/<Board>/check`, fix every error and warning it lists, then read the PNG path it returns and look at it. Repeat until `errors` and `warnings` are empty and the picture matches the running app's component.
