# TODO · Design canvas

## M1 · Runtime spike

- [x] `apps/design/public/runtime/parse.js`: board → `{ head, template, props, script }`
- [x] `apps/design/public/runtime/eval.js`: dotted lookup, raw vs interpolated hole
- [x] `apps/design/public/runtime/render.js`: `x-dc`, `helmet`, `sc-if`, `sc-for`, `dc-import`
- [x] `render.js`: events, `ref`, `DCLogic`, keyed child reuse, unmount
- [x] `apps/design/public/runtime/env.js`: token + string substitution, `dir`/`lang`
- [x] `apps/design/public/runtime/support.js`: boot from `__CANVAS_ENV__`, post ready/error
- [x] Spike page renders `Leads`, `Table`, `Dialogs`, `Icons`, `Motion` without console errors
- [ ] Eyeball the five boards against the artifact; stop and re-plan if fidelity fails

## M2 · Server and shell

- [x] `apps/design` workspace package: `package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`
- [x] Root `package.json`: `canvas` script
- [x] `src/app/b/[board]/route.ts`: serve a board with env injected
- [x] `src/app/api/canvas/route.ts`: read and write `design/canvas.json`
- [x] `src/lib/pages.ts`: curated board → page table, total and one-to-one
- [x] `apps/design/scripts/build-canvas.ts`: generate `design/canvas.json` (pages, grid, sizes)
- [x] `src/canvas/`: viewport with pan/zoom/fit and page jump
- [x] `src/canvas/`: lazy frames, loading and error state per frame
- [x] `src/canvas/`: sidebar with search, page filter, single-board view

## M2b · Pages and performance (02 §A, §C)

- [x] `/b/<board>` serves the import closure in `#dc-bundle`, `ETag` + `no-cache`; `support.js` fetches nothing
- [x] Pan and zoom write the transform in `requestAnimationFrame`; React takes the view when the gesture settles
- [x] Mount queue (2 at a time, centre first) and keep-alive (16 live, LRU)
- [x] `/` page index, `/p/<pageId>` page world, per-page view in `sessionStorage`, min zoom 0.02
- [x] `GET /api/pages/<pageId>` compact manifest
- [x] `canvas:thumbs` with Playwright, thumbnails below zoom 0.25, stale on change
- [ ] Re-measure `LeadDetail`: requests, bytes, time to `ready`; decide on the shared parse cache

## M2d · UI and UX (02 §D)

- [x] Root board sent once (`#dc-root` template), bundle without the root
- [x] Layout: pages + boards panel, toolbar (Move, Hand), zoom menu, minimap, inspector
- [x] Shortcuts and zoom steps from the §D table; animated camera moves that input cancels
- [ ] Constant-size labels, screen-space outlines, dot grid
- [x] `will-change` only during gestures; thumbnail under the frame until `ready`; `content-visibility` on hidden frames
- [ ] Labels clip to the frame width at low zoom (they overlap at 6%)
- [ ] Browser pass: pan, zoom, every shortcut, minimap, inspector, no console error

## M2c · Session bridge (02 §B)

- [x] `prepareSource` stamps `data-dc-at="<Board>:<line>"`; test on an imported element
- [x] `/api/comments` (draft, queued, delivered, replied, resolved) in `apps/design/.data/`, gitignored
- [x] Comment mode in the canvas: pick element, pin, thread, batched Send, session picker
- [x] `/api/sessions`, `/api/health`, `/api/events` (SSE on `design/` changes), frame reload by closure
- [x] Local plugin `plugins/design-canvas/` + marketplace: `/canvas`, `/canvas-stop`, `/canvas-comments`, `design_canvas` tool, poll and `$.prompt.submit`; `claude plugin validate`
- [x] `canvas:comments --wait` CLI fallback
- [ ] End to end through the real plugin: install it, `/canvas Leads`, Send, the turn arrives by `$.prompt.submit` (HTTP flow verified with session `cli`)

## M3 · Variables

- [ ] `src/lib/tokens.ts`: colours from `tokens.css`, radius/type scale from `docs/15`, hex frequency
- [ ] Variables panel: colour, radius, type collections, change marks, reset
- [ ] Override → `rev` bump → mounted frames reload
- [ ] String bindings: exact literal → catalogue key, stored in `canvas.json`
- [ ] Per-board string list with mapped/unmapped state and coverage
- [ ] AR/EN preview: catalogue values, Arabic fallback flagged, `dir`/`lang` flip

## M4 · Persistence and export

- [ ] Debounced save of `design/canvas.json` with saved/failed state
- [ ] `/api/export`: diff for `tokens.css` and both catalogues, copy only
- [ ] `docs/16-design-canvas.md` and one line in `docs/README.md`
- [ ] AGENTS §4: `bun run canvas`
- [ ] ADR 0046: dev-only app, render-time variables, export not write

## M5 · Verification

- [ ] `tests/runtime/parse.test.ts`
- [ ] `tests/runtime/render.test.ts`
- [ ] `tests/runtime/child-state.test.ts`
- [ ] `tests/runtime/env.test.ts`
- [ ] `tests/pages.test.ts`
- [ ] `tests/tokens.test.ts`
- [ ] `tests/bindings.test.ts`
- [ ] Headless sweep of all 181 boards: no console error, no empty render
- [ ] `node scripts/ci-local.mjs --quick` on the new files
- [ ] Manual pass: token change, AR→EN, restart persistence

## Retire the remote artifact (2026-11-08)

- [x] Boards synced from the live artifact (205 boards, 15 pages with boards), `design/canvas.json` rebuilt
- [x] AGENTS 5.21, CLAUDE.md, docs 13, 14, 15, README and the PR template point at `design/`; ADR 0045
- [x] `canvas-guard.py` and its `.claude/settings.json` entries removed
