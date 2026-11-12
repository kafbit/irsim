# TODO · 2026-11-12 frame comment

- [x] Branch `feat/frame-comment` from the current HEAD (the canvas boards are not on `main` yet)
- [x] Board: `CanvasFrame` gets `hover` (none, title) drawn in `commenting`; new board `CanvasFrameCommentingTitle` shows it, with the `theme` switch
- [x] `design_canvas check` reports ok, screenshot looked at
- [x] User confirms the board
- [x] `model.ts` `boardPick` and `placeText`; `turn-text.ts`, `comment-card.tsx`, `comment-form.tsx`, `plugin/hooks/tool.ts` use `placeText`
- [x] `frame.tsx` `onComment`, crosshair and ring on title hover; `page-canvas.tsx` wires it to `setPick`
- [x] Tests: `boardPick`, `placeText`, turn text for line 0
- [x] Compare the running canvas with the board at the same width (screenshots)
- [x] Verify: typecheck, lint, affected tests
