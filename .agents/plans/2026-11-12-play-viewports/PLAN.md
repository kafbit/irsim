# 2026-11-12 play viewports

## Goal

Remove "Open alone". Play replaces it for every board, and full screen Play gets a top bar to pick a device viewport or resize freely.

## Approach

- The board comes first (`irsim-workflow`): `CanvasPlayView` and its state boards, then the user confirms, then the code.
- Play full screen keeps its place, `PlayView`. Its header gains the viewport controls. The iframe gets the chosen width and height, so the board's media queries answer to that size. The stage scales the iframe down to fit, as it does now.
- Viewport control (left to right in the header): Back, title, preset menu, width and height inputs, rotate, zoom readout, Esc to stop.
- Presets: Fit window (today's behaviour), Phone 390 x 844, Large phone 430 x 932, Tablet 768 x 1024, Laptop 1280 x 800, Desktop 1440 x 900, Board size (the authored size).
- Free resize: the Responsive preset shows drag handles on the stage's right and bottom edges and the same width and height inputs.
- Open alone is removed from the inspector and the sidebar row. Both get Play (full screen) for every board, not only prototypes. The frame title chip stays for prototypes only.
- The `alone=1` route, `SingleBoard` and its legacy redirect go. The legacy `/?board=X` link moves to `play=full`.

## Decisions

- Viewport controls live in full screen Play only. Play on canvas keeps the frame as drawn, and the frame can already be resized on the canvas.
- The chosen preset and size persist in `localStorage` (one value for all boards), so the next Play starts there.
- Rotate swaps width and height. Inputs clamp to 200..4000.
- A board with `expand: fill` starts on Fit window and fills the stage, as now.

## Comments in Play (decided)

- The Play header gets the Comment toggle (`C`), with the same picks, pins and thread panel as the canvas. Approve is not carried, the inspector keeps it.
- A comment made in Play stores a `view`: `{ width, height, preset, scrollX, scrollY }` of the frame at the moment of the pick. The pick rect stays in the frame's own coordinates.
- The Claude turn text for such a comment adds one line, for example `viewport 390 x 844 (Phone), scrolled to y 1200`, so the session can reproduce the view.
- The comment card shows the viewport as a chip next to the place text.
- Pins show only while the Play viewport equals the comment's viewport (the rect belongs to that layout). On the canvas a comment with a `view` shows no pin, and its card says "Phone 390 x 844".
- Clicking such a card opens the board in live Play at the comment's viewport, on the canvas page and from inside Play, resolved comments too. It scrolls to the stored position, opens the thread and locates the element. This extends the locate behaviour just added.
- The card is the place that shows it: the chip reads the preset and size (`Phone 390 x 844`), and the card of the open thread has a "Viewing at this viewport" state while Play matches it.
- The Play header shows the same size in its inputs, so the match is visible in both places.
- A comment with no `view` (made on the canvas) opens Play on Board size as before.
- The server store, the comments API validation, `turn-text.ts`, `plugin/hooks/tool.ts`, `comment-card.tsx` and `comment-form.tsx` learn the optional `view`.

## Open choice for the user

- The preset list above is my pick. Say which to add or drop.

## Milestones

1. Boards drawn and checked, user confirms.
2. `PlayView` viewport state, presets, inputs, resize handles.
3. Comment mode in Play with `view` on the comment, the card chip, the turn text and the open-at-viewport locate.
4. Inspector and sidebar use Play, `SingleBoard` and the alone route are removed.
5. Docs, `AGENTS.md` table, tests, screenshots.

## Risks

- Deleting `SingleBoard` removes the one place that showed a board at 1:1 with scrolling. Device presets cover it, Board size matches the old scale.
- A comment's rect is only valid for the viewport it was made in, so pins are hidden elsewhere and the card opens Play at that viewport.
- Existing stored comments have no `view`, so the field must stay optional.
