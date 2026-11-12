# TODO · 02 update notice

- [x] Branch `feat/update-notice` from `main`
- [x] Board `design/UpdateNotice.dc.html`: the sidebar footer card in states `available`, `restart` (installed by another canvas), `updating`, `restarting`, `failed` (error, copy `irsim update`), light and dark; add it to `design/canvas.json`
- [x] `design_canvas check` reports ok, screenshot looked at
- [x] User confirms the board (stop here until then)
- [x] `bin/irsim serve`: pass `IRSIM_VERSION`, `IRSIM_LAUNCHER`, `IRSIM_PREFIX`; restart through `<prefix>/current/bin/irsim serve` on child exit 75; write and remove `<prefix>/<version>/.pids/<pid>`
- [x] `bin/irsim update`: skip a version directory with a live pid in `.pids`
- [x] `src/lib/release.ts`: latest release through `gh` with a 10 s timeout, cache file 6 h on success and 1 h on failure, `newer`
- [x] `GET /api/version` and `POST /api/update`
- [x] Tests: release cache and compare with an injected `gh`; version route states; launcher restart with a fake prefix whose server exits 75 once; cleanup skips a live pid
- [x] `src/canvas/update-notice.tsx` + `use-update.ts`: fetch, dismiss per version, update, poll until the new version answers, reload; placed in `sidebar.tsx` and `page-index.tsx`
- [x] Compare the running sidebar with the board at the same width (screenshots)
- [x] README: the notice, the `gh` requirement, the restart
- [x] Verify: typecheck, lint, 34 tests in 6 files, release build lists /api/update and /api/version
- [x] `POST /api/update` answers 403 to a request with `Sec-Fetch-Site` other than same-origin or none
- [x] End to end: release build of this branch in a temp prefix, fake `gh` reporting 0.1.9, headless Brave: card shown, Update and restart, server restarted on 0.1.9, page reloaded without the card
