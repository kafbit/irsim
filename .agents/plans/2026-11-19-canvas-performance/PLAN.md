# Canvas rendering performance

## Goal
Panning, zooming and rendering on the canvas are faster and smoother on pages with 100+ boards, using parallelism (out-of-process iframes, workers) where it is measured to help.

## Baseline (origin/main, 121 boards on `canvas-app`, headless Brave 1440x900)
| Case | fps | Main thread | Top cost |
|---|---|---|---|
| Wheel pan, fit | 30 | 3.24 s busy of 3.3 s | style 1719 ms |
| Wheel pan, 100% | 37 | 3.12 s | style 1919 ms |
| Marquee + wheel, fit | 33 | 3.15 s | marquee write p95 68 ms |
| Ctrl+wheel zoom, fit | 52 | 2.46 s | paint 952, style 460, layout 301 ms |
| Select 1 board | | long task 75 to 80 ms | inspector mount and layout |
Scripts: `scratchpad/perf/{wheel,zoom,marquee,select,stylecost}.mjs`.

## Causes
1. `Camera.draw` writes `--grid-*` on the viewport every frame; inherited custom properties on the ancestor of about 3000 elements cost 12 to 17 ms of style recalc per frame. Suppressing them gives 58 to 60 fps.
2. `--k`, `--inv`, `--label-scale` are rewritten every frame even when `k` is unchanged; frame titles (`frame.tsx:149`) and section labels (`section-layer.tsx:262-355`) depend on them, so zoom costs layout per board.
3. The marquee is React state on `PageCanvas`: about 7 ms per pointer move, plus a selection dispatch per move.
4. Layerize and paint of 121 rounded, clipped, outlined boards under `will-change: transform`.
5. `Inspector` and `Sidebar` re-render on selection (75 ms long task); `TopBar`, `Toolbar`, `ViewControls` are not memoised.

## What the open-source canvases do
- tldraw: camera transform from a signal reactor, no React per frame; R-tree culling with `display:none`; `cameraState` moving/idle with a frozen zoom level while moving; overlays in one reactive 2D canvas; brush writes state only when changed; iframes get pointer events only while editing.
- Excalidraw: canvas redraw with React state for scroll and zoom (slower model); per-element bitmap cache per zoom; linear hit test.
- Penpot SVG: frames outside the active set draw as thumbnail images, the closest precedent for irsim. Penpot render-wasm and OpenPencil: Skia tiles (512 px) with an LRU or byte budget, a preload ring, coarse-tile fallback while moving, effects skipped during gestures, overlays on a separate layer. Neither renders live HTML, so a canvas or WASM renderer can only replace the thumbnail layer, not live boards.
- Chrome: `will-change: transform` keeps the old raster while scaling, so content sharpens only after it is removed on settle (irsim already does this).

## Approach
1. Marquee outside React, painted in the camera's animation frame, world-anchored, selection dispatched only when the set changes. (done, unverified in a browser)
2. Grid variables on a dedicated empty layer; camera writes only changed values. (in progress)
3. Moving state: `data-moving` on the world during gestures; hit testing off for frames while moving; zoom variables held at a stepped level during a zoom gesture and set exactly on settle.
4. Culling: boards outside the viewport plus a margin get `content-visibility: hidden`, from the camera listener, toggling only changed boards; selected, booting and interacting boards stay.
5. React: memoise `TopBar`, `Toolbar`, `ViewControls`, `Sidebar`; stable props; split the inspector mount.
6. Parallelism: boards on a separate site (for example 127.0.0.1 next to localhost, a configurable board origin later for the cloud) so Chromium runs them as out-of-process iframes. Needs `comments/frame-input.ts` and the comment mode to move from direct `win.document` access into the board runtime with message relays, and `postMessage` target origins to change. Measure board boot long tasks first.
7. Mounts: no new iframe boot starts while the camera moves; boots resume on settle.
8. Workers: only where a measured main-thread cost remains (spatial index and hit testing beyond a few hundred boards, thumbnail decode with `createImageBitmap`). The measured costs today are style, layout and paint, which a worker cannot run.

## Decisions
- Measure every step with the same scripts; keep a change only if it improves fps or main-thread time.
- No visual change: labels and grid look the same at rest.

## Risks
- Out-of-process iframes cost memory per process and change the comment-mode input path.
- `content-visibility` on boards with live iframes may pause them; exclude mounted live boards at first.

## Results so far (kept state, 3 runs, headless Brave, 121 boards)
| Case | origin/main | Now |
|---|---|---|
| Wheel pan, fit | 30 fps, busy 3.24 s | 60 fps, p95 16.7 ms, busy about 1.1 s, no long tasks |
| Wheel pan, 100% | 37 fps, busy 3.12 s | 60 fps, p95 16.7 ms, busy about 1.1 s, no long tasks |
| Marquee + wheel | 33 to 40 fps, marquee write p95 65 to 68 ms | 59 to 60 fps, p95 about 17 ms |
| Zoom, 100% | 51 fps, 7 long tasks (489 ms) | 55 fps, 0 to 1 long task |
| Zoom, fit | 52 fps, busy 2.46 s | 49 to 53 fps, busy 1.6 to 1.9 s, 4 to 9 long tasks (open) |

## Out-of-process iframes: not adopted
Serving boards from 127.0.0.1 next to localhost moved board work into one extra renderer process (Chromium isolates per site, so all boards share it), but the canvas main thread got about 20% busier on pan, with no long tasks either way. Needed for a future separate board origin (also a cloud security requirement): replace direct access in `comments/frame-input.ts:13-14` and `public/runtime/pick.js:30,43`, accept the board origin in the `event.origin` checks (`use-mounts.ts:49`, `use-play-links.ts:68`, `use-frame-escape.ts:16`, `global-search.tsx:42`, `compare-view.tsx:139`, `play-view.tsx:223,276`, `comments/use-comment-mode.ts:41`, `comments/use-board-reloads.ts:19`), post to the board origin in `play-view.tsx:85-91` and `comments/use-comment-mode.ts:12`, and an absolute board URL in `frame.tsx`.

## Workers: not adopted
The remaining costs are style, layout, paint and layerize, which only the main thread runs; hit testing for 121 boards is under 1 ms.

## Final A/B against origin/main (medians of 5 interleaved runs, headless Brave, 121 boards)
| Case | fps | frame p95 ms | long-task ms | busy ms |
|---|---|---|---|---|
| Wheel pan, fit | 59.7 to 60 | 16.8 to 16.8 | 0 to 0 | 1952 to 1016 |
| Wheel pan, 100% | 59.7 to 60 | 16.8 to 16.7 | 0 to 0 | 1794 to 1140 |
| Zoom, fit | 42.4 to 51.9 | 66.6 to 33.3 | 1254 to 624 | 2224 to 1768 |
| Zoom, 100% | 32.1 to 49.7 | 83.3 to 33.3 | 3074 to 705 | 1722 to 1599 |
| Marquee + wheel, fit | 41.4 to 59.3 | 33.4 to 16.8 | 0 to 0 | 3088 to 1891 |

Marquee rectangle write after pointermove: p95 55 to 16 ms. Load average was 1 to 3.4 during the runs; zoom at 100% is the noisiest case.
