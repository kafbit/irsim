# TODO · 01 automatic board thumbnails

- [x] `src/lib/thumbs.ts`: `renderThumb`, `enqueueThumb` (globalThis queue, concurrency 2, de-duplicated by hash, failed hashes remembered, stops on `NO_CHROMIUM`, uses `withBrowser`), `thumbFailure`, `clearThumbFailure`
- [x] `src/lib/events.ts`: `{ event: 'thumb'; data: { board: string; ok: boolean } }`
- [x] `/api/thumbs/[board]`: missing file → `enqueueThumb`, 202 `pending`; failed → 404 with the reason; non-200 is `no-store`
- [x] `scripts/thumbs.ts`: uses `renderThumb` from `src/lib/thumbs.ts`
- [x] `use-events.ts` + `page-canvas.tsx`: `onThumb(board, ok)` → per-board `{ rev, ok }` passed to `Frame`
- [x] `frame.tsx` `Placeholder`: retries the `<img>` on a new rev; pulse while pending
- [x] `frame.tsx`: on img error, reads the status (2xx pending, else failed), so a failure remembered before page load does not pulse forever
- [x] `POST /api/thumbs` and `bin/irsim thumbs [--page] [--board] [--force]`
- [x] Tests: `tests/thumbs-queue.test.ts`, 202 and failure cases in `tests/thumbs-route.test.ts`
- [x] Verify: typecheck, lint, 44 tests in 4 files; live on CRM: 202 then 200 WebP, `irsim thumbs` queued 210, all 211 rendered, 0 failed
- [ ] Browser pass: zoom out below 25% on CRM and watch the boards fill in (user)
- [x] Standalone build includes `playwright-core` for `/api/thumbs`: `bun run build` lists it in both thumbs routes' `.nft.json` and in `.next/standalone/node_modules` (14 MB of 56 MB)

## Revision: installed browser

- [x] Root cause: no fault. The 0.1.1 release was built 2026-11-11 10:14, before the board check added the `playwright-core` include (4602d90, 23:55); a current build contains it
- [x] `src/lib/browser-path.ts`: find the installed browser (order in PLAN.md), `launchChromium` uses it as `executablePath`, Playwright's download as the last fallback, error text names `IRSIM_BROWSER`
- [x] Tests for the lookup order with a fake `PATH` and env
- [x] README: the browser requirement and `IRSIM_BROWSER`, drop the `playwright install` line
- [x] Verify: 17 tests in 3 files, typecheck, lint; CRM `Leads`, `LeadDetail`, `Badge` rendered by headless Brave with `PLAYWRIGHT_BROWSERS_PATH=/nonexistent`; `bun run build` contains `playwright-core`
- [x] A bad `IRSIM_BROWSER` stops the thumbnail queue like a missing browser, instead of failing once per board

## Revision: review fixes

- [x] Wheel: only a canvas frame (`/b/<board>?canvas=1`) passes a plain wheel to the parent; "Open alone" scrolls again
- [x] `FocusBar` stops `pointerdown` from reaching the viewport
- [x] `Placeholder` requests a thumbnail only while the frame is not mounted
- [x] `enqueueThumb` marks the key queued before the `await`; `renderThumb` writes to a unique temp name
- [x] Verify: typecheck, lint, 40 tests in 4 files
