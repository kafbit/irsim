# Page groups and collapsible sidebar sections

## Goal
- Group pages into collapsible groups on the home page (`/`) and in the sidebar page list, and move pages into, out of and between groups with drag and drop.
- Collapse a section of boards in the sidebar.
- Show the irsim mark (the favicon, `app/src/app/icon.svg`) on each home page card and on each page row in the sidebar.
- Sort the sidebar boards and sections by name instead of manifest order.

## Approach
- Groups are a view preference, kept per viewer in `localStorage` (`canvas:page-groups`). `design/canvas.json`, `/api/pages` and the page model do not change.
- `canvas/page-groups.ts`: pure model (`normalize`, `movePage`, `moveGroup`, `addGroup`, `renameGroup`, `removeGroup`, `toggleGroup`) with unit tests.
- `canvas/use-page-groups.ts`: reads and writes the stored value, listens to the `storage` event so the home page and the sidebar in other tabs stay in step.
- Drag and drop uses the native HTML drag events. No new dependency.
- The sidebar section header gets a separate chevron button (`aria-expanded`) that collapses the section. The title still selects the section's boards. The collapsed set is stored per page (`canvas:collapsed-sections:<pageId>`).

## Decisions
- `localStorage`, not `canvas.json`: grouping has no meaning for the project and is not committed or shared.
- Groups first, then the ungrouped pages. The ungrouped list gets an "Ungrouped" header only when at least one group exists, so it is a drop target.
- New group: a small `+` icon button (next to the "Pages" heading on the home page, next to "All pages" in the sidebar) opens a dropdown with a "Group name" field and an Add button. Enter adds, Escape closes.
- Rename: double click the group title, Enter saves, Escape cancels. Delete: a button on the group header; its pages return to the ungrouped list.
- Dragging a page onto another page inserts it before that page; onto a group header or an empty group appends it. Group headers drag to reorder groups.
- Pages missing from storage are appended to the ungrouped list in API order. Ids of deleted pages are dropped on read.
- Sidebar sort: boards by title (locale compare, numeric), ties by board name; sections by title at each nesting level. Loose boards stay above the sections. The canvas layout does not change.
- The mark is an `IrsimMark` component in `ui/icons-custom.tsx` with the same paths as `icon.svg`, filled with `currentColor` so it follows the theme tokens (`text-muted-foreground`). Card: 16 px before the title. Sidebar row: 14 px before the title.
- A board search in the sidebar ignores collapsed sections and shows every match.

## Milestones
1. Boards: `CanvasPages`, `CanvasSidebar`, `CanvasSidebarSections` and new wrapper boards. Check the page. Stop for approval.
2. Model, hook, home page, sidebar page list, sidebar sections.
3. Compare app and boards, light and dark. Typecheck, lint, affected tests, page check.

## Risks
- Native drag and drop has no keyboard path and does not work on touch. A keyboard "Move to group" menu is out of scope.
- Groups do not follow the viewer to another browser or machine.
