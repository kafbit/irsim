<!-- Check every box. If an item does not apply, check it, strike the text through and add a note: `- [x] ~~Text of the item.~~ Not applicable: reason.` -->

## What changed

## Canvas boards

The boards in `design/` (page `canvas-app`) must match the canvas app in `app/src/canvas/`. See `AGENTS.md` for the source to board table.

- [ ] This pull request changes nothing a person sees, so no board changes. Reason:
- [ ] Every changed screen, part or state has its board changed in this pull request. Boards:
- [ ] A new part, state or prop has a board or a board prop, a row in the `AGENTS.md` table, and a position in `design/canvas.json`.
- [ ] `design_canvas check` on `canvas-app` reports no errors and no warnings.
- [ ] I compared the board and the running canvas at the same width, light and dark, and listed the differences I fixed.
- [ ] A removed or renamed part has its boards and table row removed or renamed.

## Screenshots

Board and running canvas, side by side, for each changed screen.

## Checks

- [ ] Affected tests pass
- [ ] New tests that only catch a regression or prevent a bug, no testing for constants or how the UI should look like, this is a visual test and review not a code test.
- [ ] Lint and typecheck pass
