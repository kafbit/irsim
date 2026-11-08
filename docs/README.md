# 2026-11-07 · Design canvas

## Goal

`bun run canvas` opens a local, Figma-like canvas at `:3200` that draws all 181 boards in
`design/` in sandboxed frames, grouped by the artifact's 11 pages, with a variables panel.
Colour, radius and type tokens and AR/EN string variables re-render every board live. The
boards stay read-only: the claude.ai artifact remains the place a board is edited, and
`design/` stays a byte-for-byte mirror of it.

## Entry criteria

- `design/` holds the board copy (181 `.dc.html`, synced 2026-11-07) and `docs/14` holds the
  page grouping. Both exist.
- Bun 1.4.4 and Node 26.12.1 are installed (`mise install`), as for the rest of the repo.
- The artifact cannot be reached from this worktree, so the tool never publishes and never
  reads the live canvas. It reads `design/`.

## Approach

```
design/*.dc.html ──GET /b/<board>──► route handler injects env, rewrites ./support.js
        ▲                                    │
        │ never written                      ▼
        │                       public/runtime/*.js  (our renderer, not Claude's)
        │                                    │
        └── design/canvas.json ◄── Next app: pages, pan/zoom, lazy frames, panel
              layout + overrides + string bindings
```

Three pieces:

1. **Runtime** (`apps/design/public/runtime/`) — parses a board into a template AST, evaluates
   `{{paths}}`, renders `x-dc`, `helmet`, `sc-if`, `sc-for` and `dc-import`, binds events and
   lifecycle, then applies the env (tokens and string values). It replaces the missing
   `support.js`; the board tags and their rules are in `01-runtime.md`.
2. **App** (`apps/design/`) — a Next app with **no `build` and no `dev` script**, so turbo,
   CI and the deploy images ignore it. `bun run canvas` is the only way in; `:3200` is not in
   the port table because nothing else may assume it.
3. **Data** (`design/canvas.json`) — pages, frame positions, token overrides and the
   `Arabic literal → catalogue key` bindings. Written only by the canvas; read by the board
   route. `design/` gains one non-board file, which the canvas guard ignores (it only copies
   `.dc.html`).

Substitution happens at render time, in two places: token values are replaced in the board
source before parsing (so hex inside `<style>` and inside a component's JS both move), and
string values are applied to the rendered DOM (text nodes and attribute values that equal a
bound literal). No board is ever rewritten.

## Tasks

### M1 · Runtime spike — the fidelity risk

1. `apps/design/public/runtime/parse.js` — board source → `{ head, template, props, script }`.
   Strip the `x-dc`/`helmet` wrappers, keep everything else as an HTML AST; holes stay as
   `[literal, path]` segments inside text and attribute values.
2. `apps/design/public/runtime/eval.js` — dotted lookup, raw-value rule for a single-hole
   attribute, and the literal/`true`/`false` coercion imported components need.
3. `apps/design/public/runtime/render.js` — render the AST to DOM, `sc-if` truthiness,
   `sc-for` with `as`/`$index`, `dc-import` (`name`, prop attributes, `hint-size` dropped),
   `onX` handlers, `ref`, `DCLogic` (`props`, `state`, `setState`, `componentDidUpdate`,
   `componentWillUnmount`), and keyed child reuse so a parent's `setState` does not reset an
   imported table.
4. `apps/design/public/runtime/env.js` — token table application and post-render string
   substitution, plus `lang`/`dir` flip.
5. `apps/design/public/runtime/support.js` — read `window.__CANVAS_ENV__`, fetch the board,
   boot it, report readiness and errors to the parent frame.
6. Ship the spike with a test page that renders five boards (`Leads`, `Table`, `Dialogs`,
   `Icons`, `Motion`) and compare against the live artifact by eye. **If fidelity fails
   here, stop and re-plan before M2.**

### M2 · Server and canvas shell

7. `apps/design/src/app/b/[board]/route.ts` — read `design/<Board>.dc.html`, rewrite
   `./support.js` to `/runtime/support.js`, inject the env script, `force-dynamic`.
8. `apps/design/src/app/api/canvas/route.ts` — `GET` reads `design/canvas.json`, `POST`
   validates and writes it (positions, overrides, bindings).
9. `apps/design/src/lib/pages.ts` — the curated board→page table, generated once from
   `docs/14` and checked in; a test keeps it total and one-to-one.
10. `apps/design/scripts/build-canvas.ts` — create `design/canvas.json`: pages, a grid layout
    per page from `$preview` sizes, `title` from the board `<title>`.
11. `apps/design/src/canvas/` — viewport (pan, zoom, fit, page jump), lazy-mounted frames via
    `IntersectionObserver`, board sidebar with search and page filter, single-board view
    (`?board=`).

### M3 · Variables

12. `apps/design/src/lib/tokens.ts` — parse `packages/ui/src/tokens.css` into colour tokens;
    a checked-in radius/type scale from `docs/15`; frequency-sorted hex list for the rest.
13. Variables panel — colour, radius and type collections; editing one writes an override
    into `canvas.json` and reloads the mounted frames with a new `rev`; "changed" marks and a
    reset per token.
14. String bindings — flatten `ar.json`, match board literals exactly, store
    `literal → key` in `canvas.json`; the panel lists a board's strings with a mapped /
    unmapped state and a per-board coverage number.
15. Language mode — AR/EN switch: catalogue value for bound strings, Arabic fallback flagged,
    root `dir`/`lang` flip on every frame.

### M4 · Persistence and export

16. Debounced save of `design/canvas.json` from the panel, with a visible saved/failed state.
17. `apps/design/src/app/api/export/route.ts` — unified diff for `packages/ui/src/tokens.css`
    and `packages/i18n/src/messages/*.json`; the dialog shows it with copy, and writes nothing.
18. `docs/16-design-canvas.md`, one line in `docs/README.md`, `bun run canvas` in AGENTS §4,
    ADR 0046 (dev-only app, render-time variables, export-not-write).

### M5 · Verification

19. Unit tests listed below.
20. Headless sweep: a script boots the canvas and loads all 181 boards, failing on a console
    error or an empty `<x-dc>` render; print the failures as a table.
21. `node scripts/ci-local.mjs --quick` for the affected files, plus the size, spec and comment
    gates. Manual pass: token change, AR→EN on three pages, reload persistence.

### M2b, M2c · Pages, session bridge, performance

Added 2026-11-08. Specified in `02-pages-bridge-performance.md`: one route per artifact page, comments from the canvas to the Claude session through a repo mod, and a cheaper frame (one request, keep-alive, thumbnails). These run before M3, because M3's panel lives in the page shell they change.

## Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| Local dev app `apps/design`, no `build`/`dev` script | Needs local FS, `@kafbit/ui` and Tailwind; a workspace package gets lint, typecheck, arch and test discovery for free, while no `build` keeps it out of turbo, CI images and deploys | `tools/`: untyped, ungated, and a hand-rolled control set breaks 5.17 |
| Own runtime in `public/runtime/` | The referenced `./support.js` is not in the repo; the vocabulary is five tags and 15 `onX` handlers | Vendoring Tingly Design: a whole studio, off-stack, still no language modes |
| Variables applied at render time | `design/` stays a mirror; a publish never conflicts | Rewriting 181 boards to `var(--token)` / `{{t.key}}`: forks the mirror |
| Token source of truth is `packages/ui/src/tokens.css` | One palette; the override lives beside the canvas, not in a copy | A duplicated palette inside the tool |
| Only hex colours, radius and type size | 28 documented colours cover 87% of 8,027 uses; spacing is contextual | Spacing and shadow variables in v1 |
| String values come from `ar.json`/`en.json` by exact literal | 600 literals map today; EN coverage is measurable and honest | Free-text variables with no link to the app catalogue |
| Export prints a diff, never writes app files | A preview tool must not silently change app copy or colours | Canvas as source of truth |
| `design/canvas.json` holds layout and overrides | The file sits beside the boards it describes, and the guard only writes `.dc.html` | A second data directory for one file |

## Tests that must exist

- `tests/runtime/parse.test.ts` — a single-hole attribute yields the raw value; a mixed
  attribute interpolates; `helmet` content lands in `<head>`; the `x-dc` wrapper is removed.
- `tests/runtime/render.test.ts` — `sc-if` truthiness (`false`, `0`, `''`, `NaN`), `sc-for`
  scoping with `as` and `$index`, nested imports resolve props, an `onX` handler receives the
  event, `ref` receives the element, `componentWillUnmount` runs on unmount.
- `tests/runtime/child-state.test.ts` — a parent `setState` re-renders it and keeps the
  imported child's state and DOM node.
- `tests/runtime/env.test.ts` — a documented hex maps to its token, an unknown hex passes
  through, a bound literal becomes the English value, an unbound one stays Arabic and is
  reported, and `dir`/`lang` flip.
- `tests/pages.test.ts` — every board in `design/` is on exactly one page; no page names a
  missing file; frame sizes match `$preview`.
- `tests/tokens.test.ts` — every `--token: #hex` in `tokens.css` parses, and the override
  diff contains one line per changed token.
- `tests/bindings.test.ts` — a literal in `ar.json` binds, a repeated literal binds once,
  and the same literal with different spacing does not bind.

## Risks

- **Fidelity.** Our renderer is a reimplementation. M1 exists to fail fast; the sweep in M5
  covers every board but cannot prove pixel equality. Accepted: the alternative is no local
  canvas at all.
- **Child state on re-render.** `setState` is called 294 times; a naive full re-render resets
  imported tables and menus. The keyed-reuse test is what stops that.
- **1,025 Arabic literals have no catalogue key.** Many are demo data. EN mode shows them in
  Arabic and the panel reports coverage per board; no silent machine translation.
- **181 frames.** Only visible frames mount, and built HTML is cached per board and `rev`.
- **`rgba()` shadows** stay literal in v1; only hex values become variables.
- **English overflow.** Long translations will break some layouts. That is the preview doing
  its job, not a bug to paper over.

## Exit criteria

- `bun run canvas` opens the canvas on a fresh worktree with no prior build of `@kafbit/i18n`.
- All 11 pages and 181 boards render; the sweep reports zero console errors and zero empty
  boards.
- Editing a colour, a radius and a type size changes the mounted frames without a page reload,
  and survives a canvas restart.
- Switching to EN translates every bound string in a page and marks the rest.
- Export shows a diff for `tokens.css` and the catalogues and writes nothing.
- `bun run lint`, `bun run typecheck`, `bun run arch:check`, `bun run size:check` and
  `bun run specs:check` pass on the new files; `node scripts/affected-tests.mjs` passes.
