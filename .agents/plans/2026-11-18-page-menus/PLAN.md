# Page menus and page icons

## Goal
Right-click menus for pages (home page cards, sidebar rows), sidebar frames and sections, and the empty canvas; page icons from Lucide chosen by the user or the agent; no browser menu where the app has none.

## Approach
- `icon` (Lucide kebab-case name) and a renamable `title` on each page in `design/canvas.json`, edited through `PATCH /api/canvas` with `{ page, icon }` and `{ page, title }`.
- `PageIcon` renders the icon with `lucide-react/dynamic`, the irsim mark when missing or unknown.
- One page menu for home cards and sidebar page rows: Open, Open in new tab, Copy page name, Copy page link, Rename page, Change icon, Move to group, Choose icon with agent.
- Sidebar frame and section rows reuse `menuGroups`, with Show on canvas first.
- Canvas background menu: Copy page name, Copy page link, Select all, Zoom to fit, Zoom to 100%, Show or hide sidebar, Rename page, Change icon, Reorganize frames with agent, Choose icon with agent.
- A page request claim kind `{ id, page, kind: 'reorganize' | 'icon', sessionId }`, claimed and released like comments, approvals and variants, in every harness.
- A `contextmenu` handler on the app shell blocks the browser menu except in text fields.
- The page check warns on an unknown icon name; `build-canvas.mjs` keeps `icon`; the skill tells the agent to set an icon on a new page.

- Section tidy, from the section menu (Tidy submenu) and the inspector when one section is selected: In a row, In a column, Grid (columns x rows), all one-shot moves in reading order with a gap (default 40); Wrap stores `layout: { mode: 'wrap', gap }` on the section and reflows its frames when the section is resized, until a frame is moved by hand or another tidy runs. Each tidy is one undo step.

## Decisions
- Lucide is the app's icon library already; dynamic import keeps the bundle small.
- The icon lives in `canvas.json` so it is shared through git and agents can write it.
- Delete page is left out: nothing asks for it and it removes layout.

## Risks
- The new claim kind touches four harnesses; each needs a test.
