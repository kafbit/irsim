# TODO · Sections and board variants

## M0 · Thumbnail cache

- [x] `lib/closure.ts`: `render` hash; `thumbs-dir.ts` `thumbFile(render)`; all callers (`thumbs.ts`, `scripts/thumbs.ts`, `api/thumbs`, `api/pages`, `frame.tsx` `?h=`)
- [x] Touch mtime on serve, once a day per file
- [x] `thumbs/index.json` of recent render hashes per board; stale fallback with `X-Thumb-Stale: 1`
- [x] Board `CanvasFrameThumbnailStale` with the Outdated badge (part of the M1 board check and confirmation)
- [x] Frame reads the header and shows the badge
- [x] Tests: `thumbs-route.test.ts`, `thumbs-queue.test.ts`, closure test for `render`

## M1 · Boards (stop for confirmation after this)

- [x] `CanvasAppMarquee` state board: Move tool drag on empty canvas with the selection rectangle over two boards
- [x] `CanvasAppMultiSelected` state board: three boards selected, inspector with count and Create section
- [x] `CanvasAppUndoToast` state board: toast "Undid move of 3 boards"
- [x] `CanvasSearch` board (results in all five groups) and state boards `CanvasSearchRecent` (empty query) and `CanvasSearchEmpty` (no match); `CanvasAppSearch` state board with the dialog over the canvas
- [x] `CanvasSection` board: section area with label, states default, hover with drag cursor, renaming, variants section with Compare
- [x] `CanvasAppSections` state board: a page with two sections and loose boards
- [x] `CanvasSidebar`: `sections` prop, rows grouped under section headers
- [x] `CanvasInspector`: Section field, Variants box (presets, note, session, Generate); state boards `CanvasInspectorVariants`, `CanvasInspectorVariantSent`
- [x] `CanvasFrameGenerating` state board: variant frame with the "Not changed yet" badge
- [x] `CanvasCompare` board and `CanvasCompareNarrow` (390 width) state board
- [x] Place the new boards in `design/canvas.json`, add AGENTS.md table rows
- [x] `design_canvas check page canvas-app` ok, screenshots read, report to the user and wait

## M2 · Data

- [x] `canvas-pages.ts`, `canvas/types.ts`: `sections`, `section`, `variantOf`, `variantLabel`, `baseHash`
- [x] `bin/lib/build-canvas.mjs`: keep sections and variant fields, drop unknown section ids; test in `build-canvas.test.ts`
- [x] `api/canvas/route.ts`: validate the new fields; one `PATCH` edit body for boards and sections, old single-board body still accepted; `lib/canvas-layout.ts` `applyEdit` with test
- [x] `api/pages/[pageId]`: manifest carries sections and variant fields

## M3 · Selection and history

- [x] `selection.ts`: `names[]`, toggle, add, select all; `selection-keymap.test.ts`
- [x] Move tool rectangle selection in `use-gestures.ts` with a `canvas/marquee.tsx` overlay; Space and middle button still pan
- [x] Multi-board move and nudge in `use-frame-edit.ts` and `use-board-editing.ts`
- [x] Single-board consumers (inspector, focus bar, comments, play, keyboard) handle 0, 1 and many
- [x] `canvas/history.ts`: undo and redo stacks, nudge merge, skip of missing boards; `history.test.ts`
- [x] `keymap.ts`: undo, redo (Ctrl+Shift+Z, Ctrl+Y), select all, create section; not in text fields or live frames
- [x] Undo toast through `toast.tsx`

## M3b · Global search

- [x] `api/search/route.ts` with `usedBy` from `closureOf`; test
- [x] `lib/search-match.ts`: subsequence, camel-case parts, ranking; `search-match.test.ts`
- [x] `canvas/search-dialog.tsx` with groups, actions, recent items; mounted on `/` and `/p/<page>`
- [x] `keymap.ts`: Ctrl/Cmd+K, also from text fields; live frames forward the chord through `public/runtime`

## M4 · Sections in the app

- [x] `canvas/section-layer.tsx`: bounds, label, drag, rename; wired in `page-canvas.tsx`
- [x] Section create (Shift+S), rename, delete, select all on label click
- [x] Inspector Section field; sidebar grouping
- [x] Minimap draws section areas

## M5 · Variants

- [x] `lib/variants.ts`: names, copy, register, layout; tests
- [x] `api/variants/route.ts` and request delivery in `comments-store.ts` claim; `buildVariantText` in `turn-text.ts` with test
- [x] `canvas/variants/variants-box.tsx` in the inspector
- [x] Generating badge on frames

## M6 · Compare and choose

- [x] `app/p/[pageId]/compare/[board]/page.tsx` and `canvas/compare-view.tsx`
- [x] `api/variants/choose/route.ts` with importer check; tests

## M7 · Plugin and docs

- [x] `plugin/hooks/tool.ts` page output lists sections and variants; `register.test.ts`
- [x] README section on sections and variants

## M8 · Verify

- [x] Affected tests, typecheck, lint
- [x] `design_canvas check page canvas-app` ok
- [x] Playwright screenshots of board and app, light and dark, differences fixed
- [x] Board for the variant-board inspector state (`CanvasInspector` mode `variant`) and the compare error banner; the app draws both without a board
