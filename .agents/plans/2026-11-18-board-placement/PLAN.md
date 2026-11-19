# Board placement and collision (issue #24)

## Goal
New boards and sections never overlap existing ones. Inserting beside a board pushes the others to make room. Overlaps are detected and resolved with the smallest change to the layout.

## Root cause found
`bin/lib/build-canvas.mjs` gives a new board `cursorX`/`rowY` counted from (0,0) over the new boards only. Kept boards keep their stored x/y, so a new board lands on top of them.

## Approach
One pure module, `app/src/lib/board-placement.ts`, no I/O, rect in and rect out:
- `findOverlaps(rects, gap)`: pairs closer than `gap` (80, the existing board spacing; label room above a board counts via `boardRegion`).
- `placeAtEnd(existing, size, gap)`: x = left edge of the page content, y = bottom of all boards + gap. Wraps at ROW_WIDTH for several new boards.
- `placeBeside(existing, anchor, side, size, gap)`: puts the new rect left or right of the anchor, then shifts every board whose region intersects it, and the boards those hit in turn, along x by the minimum distance (cascade in the push direction only). Boards in other rows are untouched.
- `resolveCollisions(rects, fixed, gap)`: keeps `fixed` boards where they are, moves each overlapping board by the smallest axis shift, in reading order.
Sections: a section is its member boards' bounds (or its stored area), so the same functions run on section rects and move member boards with them.

## Where it runs
- `build-canvas.mjs`: unlisted boards use `placeAtEnd` against the kept boards (fixes the reported overlap).
- `PATCH /api/canvas` (`applyEdit`): a board or section move or resize that overlaps another is resolved with `resolveCollisions`, the edited items fixed. Existing overlaps the edit did not touch are left alone.
- Client: drag and nudge in `use-board-layout.ts` show the same result as the server (same module), so the optimistic rect matches the saved one.

## Decisions
- Module in `app/src/lib`, imported by `.mjs` through a built or plain-JS copy only if `bin` can load TS; otherwise the module is `.mjs` with a `.d.ts`. Item 1 settles this first.
- Gap 80: the SKILL.md already says boards 80 apart.
- Push along one axis only: smallest change to the overall layout.
- No change to what a person sees on screen, so no board change. A drag now pushes neighbours: that is visible, so item 7 checks the `CanvasAppMarquee`/frame boards need no update and says so in the PR.

## Rejected
- Full re-tidy on every insert: changes the whole layout.
- Server-only resolve: drag preview would jump on save.

## Risks
- Cascading pushes in dense pages move many boards. The cascade is not capped, because a cut cascade leaves overlaps.
- Sections with stored areas and nested sections: covered by tests, first version moves whole sections only.
