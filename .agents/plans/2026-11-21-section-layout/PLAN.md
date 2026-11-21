# Section-aware layout

## Goal
A board added to a section lands next to that section's boards, and no section overlaps another, also when an agent writes `design/canvas.json` directly.

## Problem
- `resolveLayout` runs only inside `applyEdit`, for a `PATCH /api/canvas` from the UI. An agent that writes `canvas.json`, or `irsim build`, never triggers it.
- All sections under one top-level section are one collision unit. Two sibling sections (Selection and Variants inside Inspector) can overlap and nothing separates them.
- Nothing places a new board inside its own section. A board with hand-picked coordinates stretches its section's area over a neighbouring section.

## Approach
1. Hierarchical resolve. `resolveLayout` resolves one container at a time, deepest first. A container is a section or the page. Its units are its own boards and its child sections (each child covers all boards below it and the stored areas). Only containers on the section chain of an edited board run. A unit pushed at one level moves all its boards, and the next level up sees the grown parent.
2. `placeInSection`. For a board that is new on a page, or changed section, in a disk change: keep its position when it is clear of every board and its section does not newly touch another unit. Otherwise try the spots right of and below each other board of its section, keep the clear ones, and take the one that touches the fewest other units, then grows the section's box least, then reading order.
3. `syncFromDisk(previous, next)`. A pure function in `canvas-layout.ts`. It diffs the two files per page, places boards (step 2) and boards without x and y, runs `resolveLayout` on the boards that are new, moved, resized or changed section, and runs `shiftAreas`. It returns the new canvas, or `null` when nothing moves.
4. Snapshot and sync. `canvas-file.ts` keeps the last canvas it read or wrote on `globalThis`. A new `canvas-sync.ts` subscribes once to the `canvas` event. Under the canvas lock it reads the file, skips it when `invalid()` fails, and writes the result of `syncFromDisk(snapshot, file)` when it is not `null`. The events route starts it. `editCanvas` applies `syncFromDisk` to the file before the edit, so a PATCH does not absorb an agent's unsynced change.

## Decisions
- The sync runs in the canvas server, not in `irsim build` or the lint. The app modules are not importable from `bin/`, and a second copy of the algorithm would drift.
- A membership-only edit from the UI still does not push. Only a disk change places boards with `placeInSection`, because the UI sends a drop position the user chose.
- An invalid file is not synced. The lint (feat/format-checkers) reports it.
- No board change: nothing on screen changes except board positions.
- A section unit is the area the canvas draws: frames with their title bars, `SECTION_PAD` (64) on every side per level, and the stored area. Before this, sections 80 px apart by their boards drew overlapping boxes. `SECTION_PAD` moved to `canvas-layout.ts`; `canvas/sections.ts` re-exports it.
- `placeInSection` ranks touches page level first, so it prefers pushing a sibling inside the same parent over pushing a top-level section. A spot is blocked by the section's own boards and by boards outside its top-level section, not by sibling sections the resolve pass can push.
- A new board with no section that covers other boards moves to the nearest free spot instead of pushing them.
- The 404 frame fix is dropped from this plan. On feat/format-checkers the reader drops boards with no file, and the file deletion already refetches the page manifest, so the frame unmounts.

## Risks
- An agent that keeps writing a stale copy of `canvas.json` overwrites the sync's moves. The next sync runs again on its write, so the file converges, but the agent's later read can differ from what it wrote.
- feat/format-checkers changes `canvas-pages.ts` and `canvas-file.ts` too. The merge order decides who resolves the conflict. Its reader fill for missing x and y should then call `placeInSection`.
- Pushing whole sections on a large page can move many boards at once. Today's PATCH already does this for top-level sections.
