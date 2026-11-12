# 01 · Automatic board thumbnails

## Goal

Below zoom 0.25 every board shows a picture of itself, without a manual step. Today it shows a grey box with the board name, because thumbnails come only from `bun run canvas:thumbs` and nobody runs it (`~/.cache/irsim/thumbs` does not exist on this machine, and the `irsim thumbs` command the route's 404 message names does not exist).

## Research

| Tool | What a zoomed-out board shows | Why |
| --- | --- | --- |
| Figma, OpenPencil (Skia/CanvasKit), Penpot 2.16 (WebGL) | The real content at every zoom | They draw their own scene graph; a board is vectors, not a web page |
| Penpot SVG renderer | A generated thumbnail per board, live only for the board being edited | Drawing every board as SVG is too slow |
| tldraw | Embeds are culled off screen (`display: none`); exports show a blank rectangle | An iframe cannot be captured |
| Excalidraw | Embeddables are live iframes | Few embeds per scene |

irsim boards are HTML pages in iframes, so drawing them directly is not possible. Penpot's model (thumbnail outside the board being worked on) is the one that fits, and irsim already has its parts: the Playwright renderer in `scripts/thumbs.ts`, the shared Chromium in `board-check.ts`, the cache in `thumbs-dir.ts`, the `/api/thumbs/<board>` route and the `<img>` in `Placeholder`. The missing part is who triggers the render.

## Approach

```
Placeholder <img> ──GET /api/thumbs/B?h=H──► route
                                              │ file B.H.webp exists → 200 webp
                                              │ missing → enqueue(B), 202
                                              ▼
                               thumb queue (server, 2 at a time, shared Chromium)
                                              │ render → B.H.webp
                                              ▼
                               emit SSE { event: 'thumb', board: B }
                                              │
Placeholder ◄── useEvents onThumb(B) ── retries its <img>
```

## Decisions

- Render on request, not at `serve` start: the `<img loading="lazy">` requests only boards near the viewport, so the visible ones render first and a 200-board project does not start 200 renders.
- Server-side Playwright, not capture in the browser (`html2canvas`, `html-to-image`): `docs/02` already rejected it as slow and wrong on SVG and `backdrop-filter`.
- Reuse `withBrowser` from `board-check.ts`: one Chromium per server, closed after 60 s idle.
- Queue concurrency 2 and de-duplicated by `board.hash`, so a repeated request does not render twice.
- A board edit changes its closure hash, so the next request renders the new version; no stale marking needed.
- No Chromium installed: the queue stops after the first failure and the route returns 404 with the `NO_CHROMIUM` message; the placeholder stays as today.
- Keep `canvas:thumbs` and add `irsim thumbs` to `bin/irsim` as the pre-warm command the route already names.
- The placeholder without a thumbnail shows a pulse while a render is queued, so "loading" and "failed" look different.

## Milestones

1. Server queue + route enqueue + `thumb` event.
2. Client retry on `thumb` and pending state.
3. `irsim thumbs` command.

## Risks

- First zoom-out on a large project keeps Chromium busy for a minute or two (about 0.6 s per board at concurrency 2).
- Chromium uses 200 to 400 MB while rendering; it closes after 60 s idle.
- A board that never becomes ready costs `READY_TIMEOUT_MS` (15 s) per attempt; a failed hash is remembered for the process and not retried.

## Revision 2026-11-12: installed browser, no Chromium download

Playwright's own Chromium is a 126 MB download into `~/.cache/ms-playwright`. Every user already has a Chromium-family browser, so the thumbnails and the board check launch that one headless through `playwright-core` (`executablePath`).

- Lookup order: `IRSIM_BROWSER`, then Chrome, Chromium, Brave and Edge on `PATH` and in the macOS application folders, then Playwright's downloaded Chromium.
- No browser found: the error names `IRSIM_BROWSER` and the browsers looked for; boards stay grey.
- `playwright-core` (14 MB) stays: the board check needs console errors and the ready signal, which a `--screenshot` command line run cannot give.
- The 0.1.1 release contains no `playwright-core` although `next.config.ts` asks for it on the check route, so the release must be built and checked for it.
