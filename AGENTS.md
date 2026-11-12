# irsim agent rules

## The canvas app has boards

`design/` holds boards that draw the irsim canvas app itself, on the page `canvas-app` (`/p/canvas-app`).
The boards and the app in `app/src/canvas/` must show the same thing.
A change to one updates the other in the same pull request.

| App source | Board |
|---|---|
| `canvas/sidebar.tsx` | `CanvasSidebar` |
| `canvas/page-index.tsx` | `CanvasPages` |
| `canvas/inspector.tsx`, `canvas/approvals/approve-box.tsx` | `CanvasInspector` |
| `canvas/toolbar.tsx` | `CanvasToolbar`, `CanvasToolbarComment` |
| `canvas/view-controls.tsx`, `canvas/minimap.tsx` | `CanvasZoomBar`, `CanvasZoomBarMenu` |
| `canvas/focus-bar.tsx` | `CanvasFocusBar` |
| `canvas/toast.tsx` | `CanvasToast` |
| `canvas/comments/thread-panel.tsx`, `canvas/comments/comment-card.tsx` | `CanvasThread`, `CanvasThreadResolved`, `CanvasThreadEmpty` |
| `canvas/frame.tsx`, `canvas/overlay.tsx` | `CanvasFrame` and the `CanvasFrame*` state boards, among them `CanvasFrameCommentingTitle` for the frame title in comment mode |
| `canvas/update-notice.tsx`, `canvas/use-update.ts` | `UpdateNotice` and the `UpdateNotice*` state boards |
| `canvas/canvas.tsx`, `canvas/page-canvas.tsx` and any layout of the parts above | `CanvasApp` and the `CanvasApp*` state boards |
| `app/ui-tokens.css`, `app/globals.css` | the token block in every `Canvas*` and `UpdateNotice*` board |

## When you change the canvas app

1. Load the `irsim-workflow` skill before changing what a screen shows.
2. Change the board first, check it with `design_canvas {action: "check", page: "canvas-app"}`, and look at the screenshots.
3. Stop and wait for the user's confirmation before writing app code, as the skill says.
4. After the code change, compare the board and the running canvas at the same width with Playwright screenshots, light and dark.
5. A new part, state or prop gets a board or a prop on the existing board, a row in the table above, and a position on the `canvas-app` page in `design/canvas.json`.
6. A removed or renamed part removes or renames its boards and its table row.

## Board conventions

- English only: `<html lang="en" dir="ltr">` and `dir="ltr" lang="en"` on the root div, because the irsim runtime previews boards right to left by default.
- Every board has a `theme` prop (`light` or `dark`). A board that imports another passes `theme="{{theme}}"` down.
- Tokens come from `app/src/app/ui-tokens.css` and `app/src/app/globals.css`. Use `var(--token)` only, never a close color.
- State boards (`CanvasFramePending`, `CanvasAppPlaying`, and the others) are `dc-import` wrappers with fixed props, so they follow the base board without a second copy of the markup.

## Pull request description

- Use `.github/pull_request_template.md` and fill in every section.
- Check every checkbox. An unchecked box means the work is not done.
- A box that does not apply is also checked, with the text struck through and a note that says why: `- [x] ~~Text of the item.~~ Not applicable: reason.`
- Never delete an item and never leave it unchecked without a reason.

## Before you finish

- `design_canvas {action: "check", page: "canvas-app"}` reports no errors and no warnings.
- The pull request description has the board checklist from `.github/pull_request_template.md` filled in.
