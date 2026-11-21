# Agent-first canvas

## Goal

The agent creates and changes pages and boards. The app can still edit everything by hand, but those edits sit in menus and modals. A person can talk to the agent from the Pages index, from the sidebar and from a comment thread.

## Approach

- One composer: text box, pasted images, session chip, Send. Options menu holds variants (count and presets) and, in the comment form, auto-send.
- Index: hero composer when there are no pages, a slim composer bar above the cards when there are.
- Sidebar: composer docked at the bottom, scoped to the selection, else the page.
- Top bar: Review N (batch approve and build) and a more menu (Settings, Theme, Undo, Redo, Reorganize with agent, Shortcuts).
- Inspector: Review box, Ask about this board, Details collapsed, section actions under one menu, Arrange opens one modal. The Section field is removed.
- Context menu groups: Agent, Arrange, Page, Copy.
- Zoom menu keeps zoom, fit and minimap only.
- Backend: `POST /api/page-requests` gets `kind: "ask"` with `{ prompt, scope, images? }`.

## Decisions

- The composer sends at once. Comments keep their drafts.
- Variants are generated only from the composer Options. The context menu item opens that composer.
- Approve and build stays in the top bar, the inspector and the thread. It leaves the context menu.
- Tidy is one Arrange modal. The inspector Tidy block goes.
- The session picker is one chip per surface.
- New group `+` leaves the index and the sidebar. It stays in the page menu (Move to group, New group).
- Boards first, a stop for confirmation, then code in 3 pull requests.

## Milestones

1. Boards: composer, index, sidebar, top bar, inspector, Arrange modal, context menu, zoom menu.
2. Confirmation of the boards.
3. PR 1: `ask` request, composer, index and sidebar.
4. PR 2: top bar and context menu.
5. PR 3: inspector and Arrange modal.

## Risks

- About 25 boards change. A page check can time out, so check board by board.
- Removed controls cost discoverability. Each stays reachable in a menu.
- No session: the composer is disabled with a hint to run /irsim.
- The `ask` prompt depends on how the agent reads scope. It cannot be verified without a live agent run.
- Page groups are stored only in the browser, so the agent cannot see them. Out of scope.
