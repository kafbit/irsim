---
name: irsim-workflow
description: The design-first process for any project that keeps its screens as boards in irsim. Use before planning or changing anything a person sees (a screen, popup, state, layout or shared component), when the user pastes a screenshot or asks to move, add, remove or restyle UI, and when implementing from a board. The board changes first, the user confirms it, then the code follows, and the board stays in step with the app.
---

# irsim workflow

The boards in the design folder are the design. The app must match them, and they must match the app.

## When this applies

Any change to what a screen shows or lets the user do: moving, adding, removing, resizing or restyling anything visible, including a one-control move or a layout that differs at one breakpoint.

It does not apply to a change that alters nothing a person sees (a refactor, a server-only fix with no visible effect).

## The order

1. Plan. Name the boards that change, what changes in each, and the app files that would follow. List open choices, do not decide them. Put the board change in the plan as its own step, before the implementation steps.
2. Change the board. Edit the `.dc.html` file. Draw the new states: disabled and locked controls, confirmation dialogs, empty, loading and error states, and every language and width the screen has. The canvas has no prop switcher: the user sees only the boards placed on a page. Draw each state, and each option of a choice the user must make, as its own state board: a `dc-import` wrapper of the base board with fixed props, named `<Board><State>`, with a title, placed on the page. Group the states of one screen in a section (see Sections).
3. Check the board. Run `design_canvas {action: "check", board: "<Board>"}` (or `page` for every board of a page). Fix every error and warning it lists, then open the screenshot it returns and look at it. Check again until it reports `ok`.
4. Report and stop. Give the board name and its route (`/p/<page>?board=<Board>`), the plan and the open choices. Give the route of each state board. Never ask the user to set a prop value to see a state. Write no app code until the user confirms in a separate message. A request is not a confirmation: "implement", "make it", "move X" and a pasted screenshot all ask for the board change. The user can also confirm with the Approve button in irsim: a turn that starts with "Design canvas: the user approved board X" is the confirmation for that board. If that turn says the board changed after the approval, it is not a confirmation; ask again.
5. Implement. Read the board file again first, because the user may have edited it. A board the user edited is the source of truth over your last copy and over the plan.
6. Compare by looking. Screenshot the board in irsim and the running screen at the same width with Playwright, list every difference (layout, spacing, alignment, icons, cell content, header, footer), fix them, and screenshot again. Reading the markup or the component code is not a comparison.
7. Keep them in step. Any later change to a screen in the app updates its board in the same change. Add, rename or remove a board and update the project's board index.

## Sections

- `design/canvas.json` groups a page's boards in sections: `"sections": [{ "id": "leads", "title": "Leads" }, { "id": "leads-incoming", "title": "Incoming", "parent": "leads", "color": "red" }]`. A board joins one with `"section": "leads-incoming"`.
- Put one screen in one section, and each group of its states in a sub-section. Sections nest at most 3 levels.
- `color` is one of `gray` (the default), `blue`, `green`, `amber`, `purple` and `red`. Use it to tell groups apart, for example `red` for error states.
- A page in `design/canvas.json` has an optional `"icon"`, a Lucide icon name in kebab-case. Give every new page an icon that fits its subject, and change it when the user asks.
- Place boards 80 units apart so frame titles and section labels have room.
- A new board without x and y is placed under all existing boards of its page, and a move that overlaps another board pushes that board apart, so do not place boards by hand.

## Rules

- A board that shrinks by more than 30% in `git diff --stat` needs the user's yes in chat before you keep it.
- Shared boards (table, sidebar, topbar, menu, nav) move many screens at once. Say which screens a change touches.
- Use only the project's design system values. Never pick a close enough color or radius. If a value is missing, ask.
- Read only the boards you change, with `rg` or `sed -n`, never a whole large board.
- A pull request that changes UI source without a board change is incomplete, unless the change alters nothing visible and says so.
- Replies to canvas comments: Reply in at most three short sentences. Put long detail in the board or a file and link to it, not in the reply.
- Styles that many boards share go in `design/shared/*.css`, helpers in `design/shared/*.js` (the exports reach a board script as `shared.<name>`, for example `design/shared/table-sort.js` as `shared.tableSort`), and images and fonts in `design/shared/`, referenced as `./shared/<path>`. Keep components as `dc-import` boards.
