# Format checkers, a design skill and tolerant readers

## Goal
An agent that writes `design/canvas.json` or a `.dc.html` board by hand gets told what is wrong before it finishes, and the canvas never shows NaN or crashes on a file that is missing fields.

## What happened in dukkan-FE
- OpenCode wrote `design/canvas.json` by hand. Boards had only `name`, `x` and `y`: no `title`, `width` or `height`.
- `readCanvasPages` returns the file as written. The sidebar sorts boards with `title.localeCompare`, so `title` undefined crashed the page ("This page couldn't load").
- After OpenCode added `title`, `width` and `height` were still missing. The zoom and the minimap computed NaN% and no frame was visible.
- `irsim build` already fills title and size from each board file, but no skill, hook or message tells an agent to use it or what the file needs.

## Approach
1. One validator, `bin/lib/lint-design.mjs`, plain ESM with no dependency, shared by the CLI and the app the way `board-placement.mjs` is.
   - `canvas.json`: valid JSON, `version`, unique page ids, every board has a string `name` whose `<name>.dc.html` exists, string `title`, finite `x`, `y`, `width`, `height` with the minimum size, no board on two pages, every `.dc.html` on some page, `section` ids exist, no cycle, depth 3 at most, valid colors, `icon` is a Lucide name, section area fields all four or none.
   - `.dc.html`: file name matches the board name pattern, has `<title>`, one `text/x-dc` script with parseable `data-props`, `$preview` width and height, `lang="en"` and `dir="ltr"` on the root when the project asks for English boards, every `dc-import` resolves to a board in the design folder.
   - Output per problem: file, JSON path, rule id, one-line fix. Exit code 1 on any error, warnings do not fail.
2. `irsim lint [--fix]`. `--fix` runs `buildCanvas`, which fills title and size and places boards without x and y, and prints what it changed.
3. Tolerant readers. `readCanvasPages` fills a missing `title`, `width`, `height`, `x`, `y` from the board file, and drops a board with no file, so a hand-written file renders. The lint still reports the file as wrong, because the file on disk stays as written.
4. The agent runs it.
   - `design_canvas` gets `action: "lint"`, and `action: "check"` runs the lint first and returns its problems with the render result.
   - Claude Code and Codex: a Stop hook runs `irsim lint` and returns the problems to the agent so it fixes them before it ends. Pi, OpenCode and Command Code have no stop hook in the connectors, so they rely on the tool and the skill.
5. Skill `irsim-design` (the how): board file anatomy with one complete minimal board, `$preview`, props and state boards, tokens, the `canvas.json` schema with every field and its type, sections, naming, sizes, what `irsim build` and `irsim lint` do, and "run `irsim lint` and `design_canvas check` before you say you are done". `irsim-workflow` (the order) links to it in its first lines.
6. The plugin tells the agent: the session-start context of each harness names both skills and says to load `irsim-design` before writing a board or `canvas.json`. The skill ships in `plugin/skills`, the Codex copy, and the connectors package `files`.

## Board file format (decided by the user)
- New boards are plain `<Name>.html` files. `.dc.html` is read as a legacy format and keeps working.
- `bin/lib/board-file.mjs` (copy in `app/src/lib/board-file.mjs`, kept equal by a test) is the one place that maps a board name to its file and lists the boards. A `.html` file is a board when its source holds `<x-dc` or `type="text/x-dc"`, so other HTML in the design folder is ignored. When both `Name.html` and `Name.dc.html` exist, `.html` wins and the lint warns.
- `irsim lint --fix` renames legacy files to `.html`. Nothing renames them on its own, and this repository's own `design/` stays as it is.
- Every place that builds a `.dc.html` path (closure, variants, prompts, comment file paths, runtime pick, export, doctor, build) goes through the helper or the manifest's `file` field.

## Decisions
- One validator in `bin/lib`, not a copy in the app: the shipped app cannot import from `bin`, so it is copied the same way as `board-placement.mjs` and a test keeps the two equal.
- Tolerant reader and strict lint together: the canvas must not break on an agent's mistake, and the agent must still be told.
- No new UI. A banner for "canvas.json has problems" would need a board first, so it stays out of this change.
- Lint rules that depend on a project convention (English-only boards) read it from `.irsim.json` and are warnings by default.

## Milestones
1. Validator and its tests, with the dukkan-FE file as a fixture.
2. `irsim lint`, tolerant `readCanvasPages`.
3. `design_canvas` action, Stop hooks.
4. Skill and the plugin instructions.
5. Verify: unit tests for the changed files, then `irsim lint` against dukkan-FE (read only) and a Playwright load of a throwaway copy of its broken file.

## Risks
- A Stop hook that always fails can loop an agent. It reports at most twice per session, then lets the agent stop.
- Lint rules that are too strict reject boards a person drew in the editor. Every rule must be one the app needs to render, plus the conventions in AGENTS.md as warnings.
