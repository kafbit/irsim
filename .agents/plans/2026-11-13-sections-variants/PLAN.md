# Sections and board variants

## Goal

- Sections: named groups of boards on a page, drawn as a labelled area behind the boards, like Figma sections.
- Variants: from a selected board, ask a Claude session for several alternative versions with preset directions, compare them side by side, and keep one.
- Thumbnails rendered in one worktree are reused by every other worktree with the same board content, and an old thumbnail shows while a new one renders.
- Ctrl/Cmd+K opens a global search over boards, components, sections, pages and canvas actions, from any page.
- Undo and redo for canvas edits: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y.
- The Move tool selects instead of panning: a drag on empty canvas draws a selection rectangle, and several boards can be selected.

## Approach

### Thumbnail cache

- Today `thumbFile(board, closure.hash)` keys the file by the stamp hash (mtime and size, `lib/closure.ts`). A checkout or a new worktree changes every mtime, so every board misses and renders again (681 files, about 8 per board, in `~/.cache/irsim/thumbs`).
- `Closure` gets `render`: sha1 of the root source and its imported sources, without the root board name. The thumbnail file is `<render>.webp`. Same content in any worktree hits; a variant copy hits its base's thumbnail.
- `content` stays as it is, because approvals compare against it.
- Serving a thumbnail touches its mtime, at most once a day per file, so pruning removes only thumbnails no worktree has used for 14 days (`THUMB_MAX_AGE_MS`).
- When the current thumbnail is missing, `GET /api/thumbs/<board>` serves the newest older thumbnail of that board with `X-Thumb-Stale: 1` and `no-cache`. A small index `thumbs/index.json` maps a board name to its recent render hashes so the lookup does not scan the directory.
- The frame shows a stale thumbnail with an "Outdated" badge until the fresh one is ready.
- Old stamp-keyed files are not migrated: every board renders once after the change, and the old files are pruned after 14 days.

### Global search (Ctrl/Cmd+K)

- Ctrl/Cmd+K opens a centred search dialog on `/` and on every `/p/<page>`. It works while focus is in the canvas, the sidebar, a text field, or a live frame. A live frame posts the chord to the parent, as it does for wheel events today.
- `GET /api/search` returns one list for the whole canvas: every board with name, title, page, section, size, and `usedBy` (boards that `dc-import` it); every section with its page; every page with its board count.
- Result groups, in this order: Boards, Components (boards with `usedBy` > 0, shown with "used by N"), Sections, Pages, Actions.
- Matching: case-insensitive subsequence on name and title, ranked by prefix match, then word-start match, then position. Board names match camel-case parts, so `insvar` finds `CanvasInspectorVariants`.
- Actions: Fit page, Zoom to 100%, Move tool, Hand tool, Comment tool, Toggle theme, Play selected board, Create section from selection, Undo, Redo. An action that does not apply (nothing selected, no history) is hidden.
- Empty query shows the last 8 opened items, kept in `localStorage` per browser.
- Keys in the dialog: arrows move, Enter opens, Shift+Enter plays a board full screen, Esc closes.
- Opening a board on another page navigates to `/p/<page>?board=<Board>`, which focuses it; on the same page it focuses without navigation. A section fits its bounds. A page navigates.
- The sidebar search (`/`) stays as it is: it filters this page's board list.

### Move tool and multi-selection

- `Selection` holds `names: string[]` instead of `name`. `interacting` stays single-board and applies only when one board is selected.
- With the Move tool, a drag on empty canvas draws a selection rectangle. Boards the rectangle touches are selected, as in Figma. Shift+drag adds to the selection.
- Click selects one board. Shift+click toggles a board. Click on empty canvas clears the selection. Ctrl/Cmd+A selects every board of the page.
- Panning moves off the left button in the Move tool: Space+drag, middle-button drag, wheel and trackpad, and the Hand tool (`H`) keep panning as today.
- Dragging a selected frame title moves every selected board. Arrow nudges move every selected board. Resize stays single-board.
- Inspector with several boards selected: the count, Create section (`Shift+S`), Remove from section, and the Section field for all of them.
- `fit-selection` (Shift+2) fits the bounds of the whole selection.

### Undo and redo

- One history per page, in memory, for the browser tab. It clears on page change and reload.
- Each canvas edit pushes one entry `{ label, before, after }`. `before` and `after` hold only the board fields and section entries the edit changed.
- Recorded edits: move, resize, nudge (consecutive nudges of the same boards within 1 s merge into one entry), multi-board move, section move, section create, rename, delete, and Section field changes.
- Not recorded: variant Generate and Choose (they write board files; Choose asks for confirmation instead), and changes Claude makes to `canvas.json` or board files.
- Undo applies `before` through `PATCH /api/canvas`, redo applies `after`. A new edit clears the redo stack.
- An entry whose board or section no longer exists (Claude removed it) is skipped with a toast that names it.
- Keys: Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. The keys do nothing when focus is in a text field (the field's own undo runs) or inside a live frame.
- A toast names what was undone or redone: "Undid move of 3 boards".

### One edit endpoint

- `PATCH /api/canvas { page, boards?: [{ name, x?, y?, width?, height?, section? }], sections?: { set?: [{ id, title, variantOf? }], remove?: [id] } }` applies one edit under the existing lock. `section: null` removes the field.
- Move, resize, nudge, section move, section edits, undo and redo all use it. It replaces the single-board PATCH body; the old body `{ page, board, x, y, width, height }` stays accepted for the plugin and old tabs.

### Sections

- `canvas.json` page gets an optional `sections: [{ id, title, variantOf? }]`. A board gets an optional `section: "<id>"`.
- The section rectangle is the bounds of its member boards plus 64 px padding and a label strip. It is computed, not stored.
- The canvas draws each section behind its frames: tinted area, border, title label at constant screen size.
- Dragging the section label moves every member board in one `PATCH /api/canvas` call.
- Clicking the section label selects all its boards. Double-click on the label renames the section.
- Create a section: `Shift+S` or Create section in the inspector, from the selected boards. Delete a section from its label menu; its boards stay.
- Inspector gets a Section field: pick an existing section, create one by name, or None.
- Sidebar groups board rows under section headers. Boards without a section come first.
- `bin/lib/build-canvas.mjs` keeps `sections` and the `section` field of each board, and drops a `section` that names no section.
- `design_canvas {action: "page"}` prints sections, so the agent can place boards in them.

### Variants

- Inspector gets a Variants box for a board that is not itself a variant: preset chips (multi-select), an optional note, the session picker, and Generate.
- Presets: Better, Clearer, Simpler, Responsive, UI/UX pass, Research. Each preset is one variant. Research tells the agent to look up current patterns for this kind of screen before drawing.
- `POST /api/variants { page, board, presets, note, sessionId }`:
  - copies `design/<Base>.dc.html` to `design/<Base>Variant<Preset>.dc.html` for each preset (a numeric suffix on a name collision),
  - registers them on the page with `variantOf: "<Base>"`, `variantLabel` and `baseHash`, laid out in a row right of the base,
  - creates or reuses the section `<Base> variants` (`variantOf: "<Base>"`) that holds the base and its variants,
  - queues a variant request for the session, delivered on its next claim like an approval.
- The turn names each variant file and its direction, tells the agent to edit only that file, keep the board size, run `check` on each, and reply in at most three short sentences.
- A variant whose content hash still equals `baseHash` shows a Generating badge on its frame. The badge goes when the agent writes the file (SSE reload already exists).
- The variants section label has a Compare button. Compare opens `/p/<page>/compare/<Base>`:
  - one column per board (original first), each rendered live at the same width and scale, with its label,
  - a width selector (the board width, 1280, 768, 390) and the light/dark toggle shared by all columns,
  - Choose on each column, and Discard variants.
- `POST /api/variants/choose { page, base, pick }`:
  - when `pick` is a variant, writes its source to `<Base>.dc.html` with the base `<title>` kept,
  - deletes every variant file of the base, removes their entries and the variants section,
  - Discard is the same call with `pick: <Base>`.
- Choosing does not notify the session. The chosen board is a normal board change; the user approves it as usual.

## Decisions

- One `/api/search` list loaded on open over per-page manifests: the dialog searches across pages, and the canvas has tens to a few hundred boards, so one small JSON is enough and client-side matching gives instant results.
- Components are boards that other boards import, derived from `dc-import`: irsim has no separate component type, and this is what a designer means by a component here.
- Ctrl/Cmd+K over Ctrl+P or Ctrl+/: the common chord for command palettes (GitHub, Linear, Slack). The page calls `preventDefault`, so Chrome's Ctrl+K address-bar search does not run.

- Thumbnail key by content without the board name over the stamp hash: stamps differ per checkout, content does not, and the board name does not change the rendered pixels.
- Serve a stale thumbnail with a badge over an empty frame: the board is still recognisable during the render, and the badge says it is not current.
- No migration of old thumbnail files: the old key cannot be mapped to content without rendering, and the age prune removes them.

- Figma conventions for the new input: drag on empty canvas selects, Space or middle button pans, Shift+S creates a section, Ctrl+Shift+Z and Ctrl+Y both redo. Users of design tools expect them.
- A touched board joins the rectangle selection, not only a fully contained one: matches Figma, and large boards are hard to enclose at low zoom.
- Undo history in the browser over a server history: edits come from one tab, and a server history would also have to cover Claude's edits, which git already records.
- Undo stores field-level before/after over whole `canvas.json` snapshots: a snapshot would revert Claude's concurrent changes to other boards.
- File-writing actions (variant Generate and Choose) stay out of undo: reverting them means restoring or deleting files, and git already does that. Choose gets a confirmation dialog.
- One PATCH body for every layout edit: undo, redo and multi-board moves need atomic multi-board writes, and one shape avoids three endpoints.

- Computed section bounds over a stored rectangle: one source of truth, no resize handles, and the agent only sets `section` on a board.
- Membership by a `section` field over geometric containment: moving a board out of the area does not drop it from the section by accident, and the agent can assign boards without layout math.
- Variants are real board files over in-memory drafts: the agent edits them with its usual tools, `check` works on them, and SSE reload shows progress live.
- The server creates the variant files as copies before the agent runs: the user sees placeholders at once and the agent edits a known file name instead of inventing one.
- Variants live in a section: compare and choose reuse sections, and no second grouping concept exists.
- One preset per variant over combined presets: each column answers one direction, which keeps the comparison readable.
- Choose is server-side and deterministic over a turn to the agent: picking a variant is a file copy, it needs no model call.
- No variants of a variant: the Variants box is hidden on a variant board, to keep one level.
- Rejected: Figma-style nested sections. Not needed for board pages and it complicates bounds and the sidebar.

## Milestones

0. Thumbnail cache: `render` key, touch on serve, stale fallback with the Outdated badge (board `CanvasFrameThumbnailStale` first).
1. Boards: draw the search dialog, the selection rectangle, multi-selection, sections, variants, compare and the undo toast. Check them, then stop for the user's confirmation (irsim workflow step 4).
2. Data: `canvas.json` schema, build-canvas, canvas route, manifest types.
3. Multi-selection, Move tool rectangle selection, undo and redo.
4. Sections in the app: canvas layer, drag, rename, inspector field, sidebar groups.
5. Variants in the app: request route, turn text, Variants box, Generating badge.
6. Compare view and choose route.
7. Plugin `page` output lists sections; README and AGENTS.md table rows.
8. Verify: affected tests, typecheck, lint, board check, Playwright comparison light and dark.

## Risks

- `/api/search` reads every board file to find imports. The closure cache already stats and reads them; the route reuses `closureOf`, so a repeat open costs only stats.

- Two board names in different projects with the same content share one thumbnail. That is correct: same content renders the same pixels with the same runtime.
- A runtime change in `app/public/runtime/` does not change `render`, as today with `hash`. `irsim thumbs --force` stays the way to re-render after a runtime change.

- The Move tool no longer pans with a plain left drag. That changes current behaviour for anyone used to it. Space+drag, middle button, wheel and the Hand tool still pan.
- Multi-selection touches every user of `selection.name` (inspector, focus bar, comments, play, keyboard). Each one keeps single-board behaviour when exactly one board is selected and hides or disables itself otherwise.
- An undo can move a board that Claude moved after the edit. The entry only writes the fields it recorded, so it reverts the user's own edit, and the toast says what moved.

- `canvas.json` is hand-edited by agents. A stale `section` id must not break the page: build-canvas and the manifest ignore it.
- Compare renders up to 7 live boards at once. The mount queue limits concurrent mounts to 2; compare mounts all columns through the same queue.
- Choose deletes files. It only deletes boards with `variantOf` equal to the base, and the original is never deleted. Git keeps the history.
- Another board can `dc-import` a variant board. Choose refuses with 409 and names the importer.
- The Generating badge compares hashes, so a variant the agent leaves unchanged stays Generating. The badge text says "Not changed yet", not a spinner, to stay truthful.
