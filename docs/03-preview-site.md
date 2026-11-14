# 03 · Static preview export

`irsim export` turns a design folder into a self-contained folder any static host can serve, so a
pull request can carry a preview that renders every board. It uses only Node builtins: no
`bun install`, no running canvas, no network.

```bash
irsim export [--design-dir <path>] [--out <dir>] [--title <text>]
make preview [PROJECT=<path>] [OUT=<dir>]
```

`--out` defaults to `dist/preview` under the project root, `--title` to `irsim preview`.

## Output

```
index.html        viewer: sidebar of pages and boards, page canvas, single board view
data.js           pages and board rectangles, read from canvas.json
preview.css       viewer styles
preview.js        viewer: routing, zoom, board links, error state
b/<Board>.html    one frame per board on disk
runtime/*.js      the board runtime from app/public/runtime
```

Every URL is relative, so the folder works at any mount path and behind any prefix.

## What the build does

- Reads `canvas.json` and creates it first when the design folder has none.
- Keeps boards that `canvas.json` does not list in an extra `Unsorted` page instead of dropping
  them, without writing `canvas.json`.
- Writes one frame per board, shaped like `GET /b/<board>`: the board's head with `./support.js`
  pointed at `../runtime/support.js`, an empty `<x-dc>`, the canvas env, the root source in
  `<template id="dc-root">` (escaped) and every imported board in `#dc-bundle`. The frame makes no
  request per import, like the canvas.
- Reports a missing import as `irsim: <Board> imports missing <Name>` and still writes the frame.
- Removes the previous `b/` and `runtime/` before writing, so deleted boards leave no stale frame.

## Viewer

The viewer loads a board frame per card at the rectangle from `canvas.json`. A page view fits the
whole page to the window width and has zoom controls; the board view fits one board and links to
the raw frame. `#/page/<id>`, `#/board/<page>/<name>` and `#/board/<Name>` (the first page that
lists it) are the routes. Six frames mount at a time, so a large page starts in order instead of
opening every frame at once.

The frame posts the same messages as on the canvas: `ready` clears the loading veil, `error` shows
the message on the card, `navigate` moves the viewer to the linked board, and `open-url` opens
`https:`, `mailto:` and `tel:` links in a new tab.

## Limits

- The frames are ES modules, so serve the folder over HTTP (`npx serve dist/preview`,
  `python3 -m http.server --directory dist/preview`). Browsers block module scripts on `file://`.
- The viewer is read-only: no comments, approvals or variables. A board keeps its own handlers and
  form state, as on the canvas.
- A board that links to a name with no file shows a toast and stays where it is.

## Pull requests

`.github/workflows/preview.yml` runs the export on every pull request, uploads `dist/preview` as the
`design-preview-pr-<n>` artifact and puts the serving commands in the job summary. Reviewers
download the artifact, serve it and open `index.html`.

To deploy to GitHub Pages instead, build with `irsim export --out <pages-dir>` in the same job and
upload that folder with `actions/upload-pages-artifact`; the relative URLs need no base path.
