# Shared folder for boards

## Goal
Boards share styles, logic and assets through one `design/shared/` folder. Components stay `dc-import`.

## Approach
- `*.css` in the folder: inlined as one `<style data-irsim-shared>` at the start of every frame `<head>`, so board styles override it.
- `*.js` / `*.mjs`: ES modules imported by the frame before mount; exports reach board scripts as `shared.<camelName>`.
- Any file: served at `./shared/<path>` relative to the board (`/b/shared/...` on the canvas, `b/shared/` in the export, `design/shared/` on disk).
- The folder's content is part of the closure hash, ETag and thumbnail render hash; the watcher reloads every frame on a change.

## Decisions
- One folder, behaviour by extension: no config needed.
- CSS first in the head: boards override it.
- `shared` is a second argument of the script factory: no global.
- No `.irsim.json` override: a renamed folder would break `./shared/` paths when a board opens from disk.

## Risks
- A shared change reloads every frame.
- A broken shared module reports an error on every frame.
