# irsim agent rules

## The canvas app has boards

`design/` holds boards that draw the irsim canvas app itself, on the page `canvas-app` (`/p/canvas-app`).
The boards and the app in `app/src/canvas/` must show the same thing.
A change to one updates the other in the same pull request.

| App source | Board |
|---|---|
| `canvas/sidebar.tsx` | `CanvasSidebar`, `CanvasSidebarSections` |
| `canvas/page-index.tsx` | `CanvasPages` |
| `canvas/inspector.tsx`, `canvas/approvals/approve-box.tsx` | `CanvasInspector`, `CanvasInspectorMulti`, `CanvasInspectorImports`, `CanvasInspectorImportsExpanded`, `CanvasInspectorMultiShared` (all selected boards in one section, with Delete section) |
| `canvas/variants/variants-box.tsx` | `CanvasInspector` (modes `variants`, `variant-sent` and `variant`), `CanvasInspectorVariants`, `CanvasInspectorVariantSent`, `CanvasInspectorVariant` |
| `canvas/top-bar.tsx` | `CanvasTopBar`, `CanvasTopBarMenu`, `CanvasTopBarIdle` |
| `canvas/toolbar.tsx` | `CanvasToolbar`, `CanvasToolbarComment` |
| `canvas/view-controls.tsx`, `canvas/minimap.tsx` | `CanvasZoomBar`, `CanvasZoomBarMenu` |
| `canvas/settings-dialog.tsx` (its entry in the zoom menu) | `CanvasZoomBar`, `CanvasZoomBarMenu` |
| `canvas/settings-dialog.tsx` (its Settings button in the top bar) | `CanvasTopBar` |
| `canvas/page-index.tsx` (its Settings button) | `CanvasPages` |
| `canvas/focus-bar.tsx` | `CanvasFocusBar` |
| `canvas/toast.tsx` | `CanvasToast` |
| `canvas/search-dialog.tsx` | `CanvasSearch`, `CanvasSearchRecent`, `CanvasSearchEmpty` |
| `canvas/search-dialog.tsx` (its search field in the top bar) | `CanvasTopBar` |
| `canvas/section-layer.tsx` | `CanvasSection`, `CanvasSectionHover`, `CanvasSectionRenaming`, `CanvasSectionNested`, `CanvasSectionSelected`, `CanvasSectionDrop`, `CanvasSectionVariants` |
| `canvas/compare-view.tsx` | `CanvasCompare` (prop `error` for the Choose failure banner, prop `confirm` for the Choose and Keep original confirmation; Discard variants opens the Keep original one), `CanvasCompareNarrow`, `CanvasCompareError`, `CanvasCompareConfirm` |
| `canvas/marquee.tsx`, `canvas/history.ts` | `CanvasAppMarquee`, `CanvasAppMultiSelected`, `CanvasAppUndoToast` |
| `canvas/comments/thread-panel.tsx`, `canvas/comments/comment-card.tsx`, `canvas/comments/comment-actions.tsx` | `CanvasThread`, `CanvasThreadResolved`, `CanvasThreadEmpty`, `CanvasThreadViewing`, `CanvasThreadSessions`, `CanvasThreadResolveMenu` (the Approve and build split button with Resolve in its menu), `CanvasThreadNoSession` (Send and the draft send button disabled), `CanvasThreadNoTarget` (the comment session picker with no session, Approve and build disabled), `CanvasThreadReplyImages` (pasted images in the reply box, a sent reply with an image; prop `attach` for the Attach images button) |
| `canvas/comments/comment-form.tsx` | `CanvasCommentForm`, `CanvasCommentFormVariants` |
| `canvas/comments/session-row.tsx`, `canvas/comments/use-session.ts` | `CanvasSession`, `CanvasSessionSeveral`, `CanvasSessionPick`, `CanvasSessionNone`, and its place in `CanvasTopBar` and `CanvasThread` |
| `canvas/play-view.tsx` | `CanvasPlayView` and the `CanvasPlayView*` state boards (`Fit`, `Menu`, `Responsive`, `Commenting`, `ZoomMenu`, `Tall`, `Contain`) |
| `canvas/viewport-bar.tsx` | `CanvasPlayView` (its header) |
| `canvas/frame.tsx`, `canvas/overlay.tsx` | `CanvasFrame` and the `CanvasFrame*` state boards, among them `CanvasFrameCommentingTitle` for the frame title in comment mode, `CanvasFrameThumbnailStale` for the Outdated badge and `CanvasFrameGenerating` for the Not changed yet badge of a variant and `CanvasFrameNew` for the New badge, `CanvasFrameMenu` and `CanvasFrameMenuNoSession` for the right click menu (props `menu` and `session`) |
| `canvas/context-menu.tsx` | `CanvasContextMenu` (prop `target`: `frame`, `frames`, `section`, `part`, `mixed`), shown in `CanvasFrameMenu`, `CanvasFrameMenuNoSession`, `CanvasFrameMenuMany`, `CanvasSectionMenu`, `CanvasSectionMenuPart`, `CanvasSectionMenuMixed` (`CanvasSection` prop `menu`) |
| `canvas/update-notice.tsx`, `canvas/use-update.ts` | `UpdateNotice` and the `UpdateNotice*` state boards |
| `canvas/settings-dialog.tsx`, `canvas/use-doctor.ts` | `CanvasSettings` and the `CanvasSettings*` state boards (`Idle`, `Checking`, `Unavailable`, `Update`), `CanvasAppSettings` |
| `canvas/canvas.tsx`, `canvas/page-canvas.tsx` and any layout of the parts above | `CanvasApp` and the `CanvasApp*` state boards, among them `CanvasAppSidebarHidden` |
| `app/ui-tokens.css`, `app/globals.css` | the token block in every `Canvas*` and `UpdateNotice*` board |

## When you change the canvas app

1. Load the `irsim-workflow` skill before changing what a screen shows.
2. Change the board first, check it with `design_canvas {action: "check", page: "canvas-app"}`, and look at the screenshots.
3. Stop and wait for the user's confirmation before writing app code, as the skill says.
4. After the code change, compare the board and the running canvas at the same width with Playwright screenshots, light and dark.
5. A new part, state or prop gets a board or a prop on the existing board, a row in the table above, and a position on the `canvas-app` page in `design/canvas.json`.
6. A removed or renamed part removes or renames its boards and its table row.
7. Use the tools already installed on the machine. Playwright launches the installed Chrome, Chromium, Brave or Edge (`channel` or `executablePath`); do not download Playwright's Chromium or add a heavy dependency where a lighter path exists.

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

## Reviewing a pull request

The user accepts a board by looking at it in irsim (the Approve button or a reply in chat). A review, by a person, a review tool or an AI agent, does not review board files.

- Do not comment on the markup, styles, copy, structure or layout numbers of `design/*.dc.html` and `design/canvas.json`. `.gitattributes` collapses them on GitHub and GitLab for this reason.
- Do check that the boards and the app agree, using the table above:
  - a change to what a person sees in `app/src/canvas/` has its board changed in the same pull request,
  - the board shows the same states, labels, controls and layout as the code,
  - a board change has the app change it describes,
  - a new part, state or prop has a board or prop, a table row and a position in `design/canvas.json`,
  - a token change in `app/ui-tokens.css` or `app/globals.css` is copied into every board token block.
- Report a mismatch as a finding on the app file, and name the board.

## Before you finish

- `design_canvas {action: "check", page: "canvas-app"}` reports no errors and no warnings.
- The pull request description has the board checklist from `.github/pull_request_template.md` filled in.
