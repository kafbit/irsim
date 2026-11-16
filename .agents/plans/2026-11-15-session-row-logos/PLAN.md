# Top bar, agent logos, New and Changed frames, section labels

## Goal

- A top bar above the sidebar and the canvas: a sidebar toggle, the page name, a search field with a `Ctrl K` hint, the listening agent session, an Approve and build split button and a Settings button.
- The sidebar can be hidden and shown. The session row moves from the sidebar bottom to the top bar.
- Every place that names a session or an agent reply shows the agent's colored logo. The inspector Variants and Approval boxes use the session row instead of the old select (`session-picker.tsx`).
- Frames show New and Changed. Approve and build acts on those frames, with a menu entry to approve all.
- Section titles look like Figma: a fixed-size label above the section's top left corner that truncates to the section width, so it never covers the frames at low zoom.

## Fixed already (no visible change, no board)

- Zoom stopped moving the frames after a frame was moved. `useCamera`'s `viewportRef` depended on `layout`; a new layout ran its cleanup, `Camera.detach()` set `world` to `null`, and `worldRef` was not called again. The ref callback now depends only on `camera`, and `detach()` leaves `world` to `setWorld`.
- Ctrl+K and Enter during full screen Play did not leave Play. `selectGlobal` now clears `fullPlay` and `playStart`.
- Frames opened from a frame link and then zoomed out below 25% showed only their name. A frame that had been live kept `mounted`, and `Placeholder` drew the thumbnail only for unmounted frames. It now draws it whenever the live frame is not ready and visible.

## Logos

| Agent | Mark | Color |
|---|---|---|
| Claude Code | Claude mark (simple-icons `claude`, CC0) | `#D97757` |
| Codex | cloud with `>_`, redrawn from the image the user sent | gradient `#A78BFA` to `#4F6BFF`, white `>_` |
| Command Code | ⌘ in a rounded square, redrawn from the image the user sent | white on `#000`, `var(--border)` outline |
| OpenCode | simple-icons `opencode` | white on a `#000` tile, `var(--border)` outline |
| Pi | simple-icons `pi` | white on a `#000` tile, `var(--border)` outline |
| other | terminal icon | `var(--muted-foreground)` |

Brand colors are the one place a board uses a literal color, because a logo keeps its own color in both themes.

## New and Changed

- Computed on the fly from `.irsim/` (git ignores it), never written to the design files.
- `.irsim/baseline.json` holds `{ page: { board: hash } }`. The first load of a page records every board, so an existing project does not show everything as New.
- New: the board is not in the baseline and has no approval. Changed: its hash differs from its latest approval, or from the baseline when it has no approval. Approving a board writes its hash to the approval as today.
- The frame title shows `New` in `var(--info-foreground)`, next to the existing `Changed` and `Approved`.

## Approve and build

- Top bar split button `Approve and build (N)`, where N counts New and Changed boards on the page. It is hidden when N is 0, and the menu part stays with `Approve all and build`.
- Menu: `Approve N changed boards and build`, `Approve all and build (M boards)`.
- One turn goes to the listening session with the list of boards.
- The inspector Approval box shows only for a New or Changed board. An approved board shows the `Approved` badge only.

## Board steps

1. `CanvasSession`: colored logos, empty state "No agent session listening / Run /irsim in your coding agent". `CanvasThread`, `CanvasThreadSessions`: same logos.
2. New `CanvasTopBar` (props `page`, `theme`, `sessions` none|one|several, `pending` 0|3, `menu` closed|open) and its row in `CanvasApp`.
3. `CanvasSidebar`: session row removed. `CanvasApp` gets prop `sidebar` (shown|hidden), state board `CanvasAppSidebarHidden`.
4. `CanvasFrame`: prop `status` adds `new`. State board `CanvasFrameNew`.
5. `CanvasSection`: the label becomes a pill above the section, prop `zoom` (normal|far) shows the truncated label. `CanvasInspector`: Approval box only for a New or Changed board.
6. Check the `canvas-app` page and look at the screenshots, light and dark.

## App steps (after board approval)

- `ui/agent-logo.tsx`; `session-row.tsx` logos and a compact top bar variant; `approve-box.tsx`, `variants-box.tsx` use `SessionRow`; delete `session-picker.tsx`; `comment-card.tsx` reply header.
- `canvas/top-bar.tsx` with the page name; `page-canvas.tsx` layout, and delete `page-label.tsx` (the page title drawn on the canvas); `sidebar.tsx` collapse (stored per viewer), session row removed.
- `lib/session-info.ts` title readers per agent; `comment-form.tsx` session row in the variants panel.
- `lib/board-status.ts` and the baseline file; `/api/approvals` returns status; batch approval turn.
- `frame.tsx` New badge; `section-layer.tsx` and `sections.ts` label pill and bounds without the strip.
- Compare board and app with Playwright, light and dark.

## Decisions

- Sidebar toggle shortcut: `Ctrl \`.
- "Approve all and build" sends one turn: the user accepted every new and changed design on the page; start work on each design change and implement it. The turn lists the boards.

## Session titles follow renames

- The server reads each agent's own session name on every sessions request (the canvas polls every 5 s), cached by file mtime:
  - Claude Code: newest `custom-title`, else `ai-title`, in the transcript (already done).
  - Command Code: `title` in `~/.commandcode/projects/<project>/<id>.meta.json`.
  - Codex: the newest `thread_name` for the id in `~/.codex/session_index.jsonl`.
  - OpenCode and Pi: the registration label until their session store is found on a machine that has them.
- No board change: the boards already show a session title.

## Comment form session

- The app disabled Generate with "No Claude session. Run /irsim in Claude Code." both when no session listened and when several listened with none picked.
- `CanvasCommentForm` prop `session` (one|several|none): the variants panel shows the session row (compact; regular with the /irsim hint when none), and Generate is disabled until a session is picked.

## Thread Approve and build

- The Resolve button on a sent comment becomes a split button. The main part is `Approve and build`, and its menu holds `Approve and build` and `Resolve`.
- Approve and build approves the commented board, resolves the comment, and sends one turn to the comment's session: the user accepted the board change for this comment; implement it in the app.
- Resolve only resolves the comment, as the button does today.
- Board: `CanvasThread` prop `resolve` (closed|open), state board `CanvasThreadResolveMenu`.
- App: `comments/comment-card.tsx` split button and menu; an `onApproveAndBuild` action in `thread-panel.tsx` that calls the approval route, resolves the comment, and sends the build turn.

## Send one draft

- A draft comment card gets a small primary Send icon button at the bottom left, before Edit and Delete. It sends only that draft to the active session.
- It is disabled with the title "No agent session listening" when no session is active (none listening, or several with none picked). The footer Send button is disabled the same way.
- Board: `CanvasThread` prop `sessions` adds `none`, state board `CanvasThreadNoSession`.
- App: `comments/comment-card.tsx` Send button on a draft; `thread-panel.tsx` sends one comment id through the existing send route.
