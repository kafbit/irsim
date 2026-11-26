# irsim agent rules

## The canvas app has boards

`design/` holds boards that draw the irsim canvas app itself, on two pages.
The page `canvas-app` (`/p/canvas-app`) holds the app screens and their parts.
The page `canvas-system` (`/p/canvas-system`) holds the `UpdateNotice*` and `CanvasSettings*` state boards, except `CanvasAppSettings`, which stays on `canvas-app`.
The boards and the app in `app/src/canvas/` must show the same thing.
A change to one updates the other in the same pull request.

| App source | Board |
|---|---|
| `canvas/sidebar.tsx` | `CanvasSidebar`, `CanvasSidebarSections`, `CanvasSidebarGroups`, `CanvasSidebarSectionsCollapsed`, `CanvasSidebarGroupMenu`, `CanvasSidebarPageMenu`, `CanvasSidebarFrameMenu`, `CanvasSidebarSectionMenu`, `CanvasSidebarIconPicker` |
| `canvas/page-index.tsx` | `CanvasPages`, `CanvasPagesGroups`, `CanvasPagesDrag`, `CanvasPagesEmpty` (the prompt box and, in the top bar row, the agent session), `CanvasPagesEmptyDraft`, `CanvasPagesEmptyNoSession` (Send disabled), `CanvasPagesGroupMenu`, `CanvasPagesPageMenu`, `CanvasPagesRenaming`, `CanvasPagesIconPicker` |
| `canvas/page-groups.ts`, `canvas/use-page-groups.ts` | `CanvasPagesGroups`, `CanvasPagesDrag`, `CanvasSidebarGroups`, `CanvasSidebarGroupMenu`, `CanvasPagesGroupMenu` |
| `canvas/inspector.tsx`, `canvas/approvals/approve-box.tsx` | `CanvasInspector`, `CanvasInspectorMulti`, `CanvasInspectorImports`, `CanvasInspectorImportsExpanded`, `CanvasInspectorMultiShared` (all selected boards in one section, with Delete section), `CanvasInspectorMultiMenu` (the Section menu), `CanvasArrange`, `CanvasArrangeGrid`, `CanvasArrangeWrap` (the Arrange modal: row, column, wrap, grid; prop `tidy`) |
| `canvas/variants/variants-box.tsx` | `CanvasInspector` (mode `variant`), `CanvasInspectorVariant`; variants are generated from the composer Options (`CanvasComposerOptions`) |
| `canvas/composer.tsx` | `CanvasComposer`, `CanvasComposerTyped`, `CanvasComposerScoped`, `CanvasComposerImages`, `CanvasComposerOptions` (Generate variants), `CanvasComposerNoSession`, `CanvasComposerCompact` (props `size`, `narrow`, `scope`, `target`), and its place in `CanvasPages` (hero and slim bar), `CanvasSidebar` (docked), `CanvasInspector` (Ask about this board) and `CanvasThread` (before the Resolved accordion, and under the hint when empty) |
| `canvas/top-bar.tsx` | `CanvasTopBar` (the Approve all and build button; the More menu is `CanvasTopBarMore`), `CanvasTopBarIdle` |
| `canvas/toolbar.tsx` | `CanvasToolbar`, `CanvasToolbarComment` |
| `canvas/view-controls.tsx`, `canvas/minimap.tsx` | `CanvasZoomBar`, `CanvasZoomBarMenu` |
| `canvas/settings-dialog.tsx` (its entry in the More menu of the top bar) | `CanvasTopBarMore` |
| `canvas/page-index.tsx` (its Settings button) | `CanvasPages` |
| `canvas/focus-bar.tsx` | `CanvasFocusBar` |
| `canvas/toast.tsx` | `CanvasToast` |
| `canvas/search-dialog.tsx` | `CanvasSearch`, `CanvasSearchRecent`, `CanvasSearchEmpty` |
| `canvas/search-dialog.tsx` (its search field in the top bar) | `CanvasTopBar` |
| `canvas/section-layer.tsx` | `CanvasSection`, `CanvasSectionHover`, `CanvasSectionRenaming`, `CanvasSectionNested`, `CanvasSectionNestedFar` (section labels paint above frame titles, the parent label above sub-section labels, and the label is smaller when zoomed out), `CanvasSectionSelected`, `CanvasSectionDrop`, `CanvasSectionVariants` |
| `canvas/compare-view.tsx` | `CanvasCompare` (prop `error` for the Choose failure banner, prop `confirm` for the Choose and Keep original confirmation; Discard variants opens the Keep original one), `CanvasCompareNarrow`, `CanvasCompareError`, `CanvasCompareConfirm`, `CanvasCompareGenerating` (prop `unchanged`: an aura around each variant the agent has not changed yet) |
| `canvas/marquee.tsx`, `canvas/history.ts` | `CanvasAppMarquee`, `CanvasAppMultiSelected`, `CanvasAppUndoToast` |
| `canvas/comments/thread-panel.tsx`, `canvas/comments/comment-card.tsx`, `canvas/comments/comment-actions.tsx` | `CanvasThread`, `CanvasThreadResolved`, `CanvasThreadEmpty`, `CanvasThreadViewing`, `CanvasThreadSessions`, `CanvasThreadResolveMenu` (the Reply split button with Resolve and Approve and build in its menu, and the check button left of it that resolves the thread), `CanvasThreadNoSession` (Send and the draft send button disabled), `CanvasThreadNoTarget` (the comment session picker with no session, Approve and build disabled), `CanvasThreadReplyImages` (pasted images in the reply box, a sent reply with an image; prop `attach` for the Attach images button) |
| `canvas/comments/comment-form.tsx` | `CanvasCommentForm` (prop `send` for the Send to the active agent checkbox), `CanvasCommentFormVariants`, `CanvasCommentFormAutoSend`, `CanvasCommentFormAutoSendNone` (the checkbox disabled with no session) |
| `canvas/comments/session-row.tsx`, `canvas/comments/use-session.ts` | `CanvasSession`, `CanvasSessionSeveral`, `CanvasSessionOneOpen` (the menu opens with a single session), `CanvasSessionPick`, `CanvasSessionNone`, and its place in `CanvasTopBar` and `CanvasThread` |
| `canvas/play-view.tsx` | `CanvasPlayView` (prop `touch`: `auto`, `on`, `off`) and the `CanvasPlayView*` state boards (`Fit`, `Menu`, `Responsive`, `Commenting`, `ZoomMenu`, `Tall`, `Contain`, `Touch`, `TouchOff`, `TouchResponsive`) |
| `canvas/viewport-bar.tsx` | `CanvasPlayView` (its header) |
| `canvas/frame.tsx`, `canvas/overlay.tsx` | `CanvasFrame` and the `CanvasFrame*` state boards, among them `CanvasFrameCommentingTitle` for the frame title in comment mode, `CanvasFrameThumbnailStale` for the Outdated badge and `CanvasFrameGenerating` for the Not changed yet badge and the aura of a variant and `CanvasFrameNew` for the New badge, `CanvasFrameCompact` and `CanvasFrameTiny` for the single status dot (Changed, New, Outdated, Not changed yet, Approved, then Prototype) under 200 px and no Play under 120 px, `CanvasFrameMenu` and `CanvasFrameMenuNoSession` for the right click menu (props `menu` and `session`) |
| `canvas/frame-edit.ts`, `canvas/use-frame-edit.ts`, `canvas/overlay.tsx`, `canvas/snap.ts`, `canvas/snap-guides.tsx`, `canvas/move-prefs.ts` (snapping guides and move steps while a frame is dragged or resized) | `CanvasAppSnapping`, and the Moving frames section of `CanvasSettings` |
| `canvas/context-menu.tsx` | `CanvasContextMenu` (prop `target`: `frame`, `frames`, `section`, `part`, `mixed`, `page`, `canvas`; prop `sidebar` adds Show on canvas; prop `submenu` draws one group flyout: `section`, `copy`, `page` or `view`; the groups are Agent, Arrange, Section, Page, View and Copy), `CanvasFrameMenuCopy`, `CanvasAppCanvasMenu`, `CanvasAppCanvasMenuView`, shown in `CanvasFrameMenu`, `CanvasFrameMenuNoSession`, `CanvasFrameMenuMany`, `CanvasSectionMenu`, `CanvasSectionMenuPart`, `CanvasSectionMenuMixed` (`CanvasSection` prop `menu`) |
| `canvas/icon-picker.tsx`, `ui/page-icon.tsx` | `CanvasIconPicker`, `CanvasIconPickerEmpty`, `CanvasPagesIconPicker`, `CanvasSidebarIconPicker` |
| `canvas/update-notice.tsx`, `canvas/use-update.ts` | `UpdateNotice` and the `UpdateNotice*` state boards, among them `UpdateNoticeRebuild` for a new build of the running version |
| `canvas/settings-dialog.tsx`, `canvas/use-doctor.ts` | `CanvasSettings` (props `snap` and `steps` for the Moving frames section) and the `CanvasSettings*` state boards (`Idle`, `Checking`, `Unavailable`, `Update`, `Moving`), `CanvasAppSettings` |
| `canvas/canvas.tsx`, `canvas/page-canvas.tsx` and any layout of the parts above | `CanvasApp` and the `CanvasApp*` state boards, among them `CanvasAppSidebarHidden` |
| `app/ui-tokens.css`, `app/globals.css` | the token block in every `Canvas*` and `UpdateNotice*` board |

## When you change the canvas app

1. Load the `irsim-workflow` skill before changing what a screen shows.
2. Change the board first, check it with `design_canvas {action: "check", page: "canvas-app"}` or `design_canvas {action: "check", page: "canvas-system"}`, and look at the screenshots.
A page check can time out on a large page.
Then check the changed boards one by one with `design_canvas {action: "check", board: "<Board>"}`, and check both pages when possible.
3. Stop and wait for the user's confirmation before writing app code, as the skill says.
4. After the code change, compare the board and the running canvas at the same width with Playwright screenshots, light and dark.
5. A new part, state or prop gets a board or a prop on the existing board, a row in the table above, and a position on its page and its section in `design/canvas.json` that no other board covers.
6. A removed or renamed part removes or renames its boards and its table row.
7. Use the tools already installed on the machine. Playwright launches the installed Chrome, Chromium, Brave or Edge (`channel` or `executablePath`); do not download Playwright's Chromium or add a heavy dependency where a lighter path exists.

## Layout checks

On top of the format rules, `irsim lint` checks the geometry of a page and `design_canvas {action: "check"}` measures each rendered board.

- `board-overlap` (error): two boards of a page cover part of each other. A frame clips its canvas, so the board under it cannot be seen or approved. Move one of them clear, or select both and use the page's Arrange. The message names the shared area, and `irsim lint --json` gives the board path.
- `board-rect` (error, warning): a board missing `x`, `y`, `width` or `height`, or with a size of 0, is an error; a width under 240 or a height under 160 warns, because a resize on the canvas cannot make it that small unless it is a deliberate small part.
- `layout: the content is 1520 px wide, the frame is 1440 px, and 80 px are cut off` (warning): the board renders bigger than its frame, so the canvas and the thumbnail clip it. Make the frame in `design/canvas.json` fit the board, or shorten the board. A board that scrolls on purpose is the only case that keeps the warning.
- Frames close but clear of each other are fine: a page groups related boards with 40 to 60 px gaps on purpose. Only shared area is a problem.
- A section stores all four of `x`, `y`, `width` and `height` or none of them (`section-area`), and a board cannot name a section the page does not have (`section-missing`). The area the canvas draws for a section comes from its boards, so fix board positions rather than section numbers.

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

- `design_canvas {action: "check", page: "canvas-app"}` and `design_canvas {action: "check", page: "canvas-system"}` report no errors and no warnings.
- When a page check times out, the changed boards pass `design_canvas {action: "check", board: "<Board>"}` one by one.
- `irsim lint` reports no `board-overlap` and no `board-rect` error, and the boards you changed report no `layout:` cut-off warning.
- The pull request description has the board checklist from `.github/pull_request_template.md` filled in.
