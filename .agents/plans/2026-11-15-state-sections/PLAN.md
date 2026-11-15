# Board states in sections, sub-sections and section colors

## Goal

- Agents stop telling the user to switch a board's props. The canvas has no prop switcher, so a state the user must see is its own state board, placed on the page.
- The states of one screen sit together in a section. A section can hold sub-sections, for example `Leads` > `Incoming` > the `LeadsIncoming*` states.
- A section has a color from a fixed palette, so neighbouring and nested sections are told apart.

## Cause

- `plugin/skills/irsim-workflow/SKILL.md` step 2 (and the Codex copy) says "Put a choice the user must make in the board as a `data-props` variant so they can switch and look". Agents follow it and report "set `drawer="invalid"`".
- Agents do not learn that `design/canvas.json` has sections, so they place state boards loose on the page.

## Agent guidance (no board)

- `irsim-workflow` skill, both copies, step 2: every state or choice the user must look at is a state board, a `dc-import` wrapper of the base board with fixed props, named `<Board><State>` and given a title. Props stay the way one board is reused, not the way the user sees a state.
- Step 4: report each state board's route, never a prop value to set.
- New short part "Sections": the canvas.json shape (`sections: [{ id, title, parent?, color? }]`, `board.section`), one section per screen, one sub-section per group of states, the color names.
- `templates/agents-block.md`: one line with the same rule, so `irsim install` writes it into projects.
- `docs/01-runtime.md`: the section fields.

## Data

- `CanvasSection` gets `parent?: string` (another section's id) and `color?: 'gray' | 'blue' | 'green' | 'amber' | 'purple' | 'red'`.
- A board still belongs to one section, the innermost one.
- A section's area covers its boards and its sub-sections, padded by `SECTION_PAD`. A sub-section has no boards of its own only when it has sub-sections; an empty one is not drawn, as today.
- The server refuses a `parent` that does not exist or that makes a cycle. Deleting a section moves its boards and sub-sections to its parent.
- Depth limit: 3 levels.

## Colors (tokens only)

| Name | Area | Label pill |
|---|---|---|
| gray (default) | `var(--secondary)` | `var(--muted)`, `var(--foreground)` |
| blue | `var(--info)` | `var(--info-foreground)` text |
| green | `var(--success)` | `var(--success-foreground)` text |
| amber | `var(--warning)` | `var(--warning-foreground)` text |
| purple | `var(--rented)` | `var(--rented-foreground)` text |
| red | `var(--destructive-tint)` | `var(--destructive)` text |

- Each pair has a light and a dark value.
- A sub-section with no color takes `var(--card)` so it reads on top of its parent's tint.

## One layer, drag in and out, resize

- Cause of the overlap in the app today: `SectionLayer` renders twice, `areas` under the frames and `labels` over them, so a frame that reaches the label strip is drawn between the area and its own header.
- A section is drawn in one layer under the frames: area and label pill together. The pill sits outside the area, above its top-left corner, so a member frame never covers it. A frame from elsewhere dragged over a pill covers it, as in Figma.
- Dragging a frame and dropping it sets its section: the innermost section whose area contains the frame's center, or no section when none does. While dragging, that section shows a 2px `var(--ring)` border. Undo restores the old section.
- A section can be resized on its own: clicking its label selects it (as today, it selects its members) and shows 8 resize handles, the same 8px handles as a selected frame. A resized section stores `x`, `y`, `width`, `height` in `canvas.json`.
- A section without stored geometry fits its members (today's behavior), so agents can still write sections without coordinates. The drawn area is always the union of the stored rect and its members and sub-sections, padded, so no member hangs outside.
- Resizing cannot cut a member out: the smallest size is the members' bounds plus `SECTION_PAD`. A parent grows to hold a resized sub-section.
- Moving a section (dragging its label) moves its stored rect, its members and its sub-sections.

## Board steps

1. `CanvasSection`: prop `color` (the six names) and prop `nested` (none|child): a section that holds a sub-section with its own label pill.
2. `CanvasSectionNested`: state board, a gray section with a blue and a `card` sub-section.
3. `CanvasSidebarSections`: sub-sections indented under their parent, with a color dot.
4. `CanvasInspectorMultiShared`: a Color row with six swatches for the shared section, and `Create sub-section` next to `Delete section`.
5. `CanvasAppSections`: one nested section on the page.
5b. `CanvasSection` states `selected` (ring border, 8 handles) and `drop` (a frame half dragged in, 2px ring border); state boards `CanvasSectionSelected`, `CanvasSectionDrop`.
6. `canvas.json` positions, `AGENTS.md` table row, page check, light and dark.

## App steps (after board approval)

- `lib/canvas-pages.ts`, `lib/canvas-layout.ts`: `parent`, `color`, validation, delete moves children up.
- `canvas/sections.ts`: bounds from boards and child sections, deepest first; `placedSections` returns parents before children so children draw on top; `createSectionEdits` sets `parent` when every selected board shares a section.
- `canvas/section-layer.tsx`: one layer under the frames, color classes from the table, nested label pills, resize handles.
- `page-canvas.tsx`: render `SectionLayer` once, under the frames.
- Frame drop sets the section (`use-frame-edit.ts`, `sections.ts` `sectionAt(point)`); section resize edits with undo (`history.ts`).
- `lib/canvas-layout.ts`: section `x`, `y`, `width`, `height`.
- `canvas/sidebar.tsx`: section tree.
- `canvas/inspector.tsx`: Color row, Create sub-section.
- Skill, template and docs text above.
- Tests for `sections.ts` bounds and edits and `canvas-layout.ts` validation.
- Compare board and app with Playwright, light and dark.

## Decisions

- Red is added with a new token `--destructive-tint` (light `#fbe9e6`, dark `#3b1814`) in `ui-tokens.css` and `globals.css`, registered as `--color-destructive-tint`, and copied into every board token block. The red label text is `var(--destructive)`.
- Shift+S on boards that all share a section creates a sub-section of it.
- Sections nest at most 3 levels.
