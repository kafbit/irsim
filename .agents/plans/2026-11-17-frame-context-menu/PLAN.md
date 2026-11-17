# Frame context menu

## Goal

Right click on a frame opens a menu: Copy frame name, Play, Comment, Generate variants, Approve and build.
Right click on a selection of several frames, a section, or a mix opens a menu for the whole selection.

## Approach

- `frame.tsx`: `onContextMenu` on the frame wrapper and the title button opens a menu at the pointer, built on the Radix `ContextMenu` from the `radix-ui` package already installed, styled like `DropdownMenu`.
- The right click selects the frame first, as a left click does, unless the frame is already in the selection.
- One component, `canvas/context-menu.tsx`, builds the items from the selection. The board `CanvasContextMenu` draws the same items for each `target`.
- Right click on a frame inside the selection keeps the selection. Right click on a frame outside it selects that frame only. Right click on a section title selects the section.
- `page-canvas.tsx` passes the handlers.

## Decisions

- Copy frame name copies `board.name` (the file name, for example `HomeThemes`) and shows the toast "Copied HomeThemes". The name is what an agent or a search needs.
- Play shows only for a prototype board, as the Play chip does, and plays on the canvas.
- Comment switches to comment mode and opens the whole-board comment form, as clicking the title in comment mode does.
- Generate variants shows when a session is connected and the board is not a variant. It selects the board and focuses the Variants box in the inspector, because variants need presets to be chosen.
- Approve and build shows when a session is connected and the board is New or Changed, as the inspector Approve box does. It sends at once with no note to the current session, and shows the toast "Sent HomeThemes to the agent to build".
- With no session, both agent items are hidden, with their separator.
- In Play and comment mode the iframe gets pointer events, so a right click inside the board keeps the browser menu. The title still opens the frame menu.

- Several frames: Copy N frame names (one name per line), Approve N and build (N is the New or Changed frames among them, hidden when 0 or with no session), then the section actions.
- Section actions follow the selection: several frames with no section get Create section. A whole section gets Rename section, Create sub-section, Remove from section and Delete section. Some frames of one section get Create sub-section and Remove from section. A section with a frame outside it gets Create section and Remove from section.
- Create sub-section shows only where the inspector shows it (`canNest`). Delete section asks nothing, as the inspector button does, because Undo restores it.

## Milestones

1. Boards: `CanvasFrame` props `menu` and `session`, `CanvasFrameMenu`, `CanvasFrameMenuNoSession`.
2. App: `ui/components/ui/context-menu.tsx`, `frame.tsx`, `page-canvas.tsx`, the inspector focus.
3. Tests and a Playwright comparison with the boards.

## Risks

- `Frame` is memoized: new callbacks must be stable, or every frame re-renders on a drag.
- Approve and build sends without a confirmation step. The toast is the only feedback.
