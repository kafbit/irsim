# Doctor and settings

## Goal

- One health check, `irsim doctor`, over the project's rules, git setup and config.
- The same check from the agent plugin (`/irsim-doctor`, `design_canvas {action: "doctor"}`) and from the canvas (`Settings` → Health).
- A `Settings` dialog in the canvas: version, a manual update check, the project context (directory, design folder, repository, branch, commit, boards, canvas port), the theme switch, and the doctor.

## Approach

### One doctor, three callers

The checks are filesystem and git reads. They need no server, so they live in `bin/lib/doctor.mjs`, a dependency-free Node module next to `build-canvas.mjs`:

- `bin/irsim doctor [--json] [--verbose]` runs it in the project root, prints one line per check and exits 1 when a check fails.
- `GET /api/doctor` runs `IRSIM_LAUNCHER doctor --json` in `IRSIM_ROOT`, the way `/api/update` already runs `IRSIM_LAUNCHER update`. Without a launcher (`bun run dev`) it answers 409, and the dialog says to start the canvas with `irsim serve`.
- The plugin runs `irsim doctor --json` in the session cwd and formats the same lines.

`--json` is one object, so the three callers read one shape:

```ts
type DoctorCheck = {
  id: string
  group: 'rules' | 'git' | 'config' | 'runtime'
  title: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  detail: string
  fix?: string       // the command that resolves it, never run by doctor
}
type DoctorReport = {
  ok: boolean        // no check failed
  root: string
  summary: { ok: number; warn: number; fail: number; skip: number }
  checks: DoctorCheck[]
  context: {
    root: string; designDir: string | null; boards: number
    repo: string | null; remote: string | null; branch: string | null
    commit: string | null; detached: boolean; dirty: number
    port: number | null; running: boolean
    irsim: string; node: string; platform: string
  }
}
```

### The checks

`config`

- `config-file`: `.irsim.json` present, valid JSON, `designDir` named. Fail names `irsim init`.
- `design-dir`: the design folder exists. Fail lists the three ways to set it.
- `canvas-json`: `canvas.json` parses and has pages. Fail names `irsim build`.
- `board-files`: every board in `canvas.json` has a `*.dc.html`. Fail names the boards.
- `gitignore`: `.irsim/` ignored. Warn names `irsim init`.

`rules`

- `agents-block`, `claude-block`: the managed block is present and equals `templates/agents-block.md`. Warn names `irsim init --refresh-block`. A missing `CLAUDE.md` is ok, not a warning.
- `review-gitattributes`, `review-copilot`, `review-coderabbit`: the review setup from `README.md` (collapsed board diffs, Copilot instructions, CodeRabbit path instructions). Warn, never fail: a project may review its boards differently.

`git`

- `git-tools`: `git` on PATH.
- `git-repo`: the project root is in a work tree. Fail.
- `git-branch`: the checked-out branch; a detached HEAD is a warn with the short commit.
- `git-remote`: `origin` present, shown as `owner/repo` when it is a GitHub URL. Warn.
- `gh`: the GitHub CLI, and whether it is authenticated, since `irsim update` needs it. Warn.

`runtime`

- `canvas`: whether this project's canvas answers on its port, and on which port. Never fails.
- `browser`: an installed Chrome, Chromium, Brave or Edge for `check` and thumbnails. Warn.

A dirty work tree is context (`dirty`), not a check: uncommitted work is normal.

### Settings dialog

One dialog, `canvas/settings-dialog.tsx`, with stacked sections and no tabs, so everything is one scroll:

1. **irsim**: the running version, and the update state from `useUpdate` (`Up to date`, `0.2.3 is available`, `0.2.3 is installed`, updating, failed). `Check for updates` calls `/api/version` with no `latest=0`, so it asks the network now instead of waiting for the hourly poll. `Update and restart` and `Restart` reuse `useUpdate().start`.
2. **Appearance**: Light / Dark. The same `useTheme`, so the zoom menu and Ctrl/Cmd+K agree. `useTheme` gains `set`.
3. **Project**: directory, design folder and board count, repository, branch and commit, uncommitted count, canvas port.
4. **Health**: `Run doctor`, then the checks grouped by group with an icon per status, the detail, and the fix command. The summary says `8 checks passed` or `1 failed · 2 warnings`.

Opened from three places: `Settings…` in the zoom menu (`CanvasZoomBarMenu`), a `Settings` button in the page index header (`CanvasPages`), and the `Settings` action in global search.

### Boards (the design step, before any app code)

- New `CanvasSettings` (props `state`, `update`), the dialog in all its states.
- New state boards: `CanvasSettingsHealth` (1 fail, 2 warnings), `CanvasSettingsChecking` (doctor running), `CanvasSettingsUnavailable` (no launcher), `CanvasSettingsUpdate` (a newer release).
- New `CanvasAppSettings`, the dialog over the canvas.
- `CanvasZoomBar`: add `Settings…` to the menu. `CanvasPages`: add the header button. `CanvasApp`: a `settings` state.
- `design/canvas.json` positions and `AGENTS.md` table rows.

## Decisions

- The doctor lives in `bin/lib/doctor.mjs` over a copy in the app: the CLI must run it with no server, and three implementations would drift. The app reaches it through the launcher, which `/api/update` already does.
- Warnings never fail the exit code. A missing CodeRabbit config or a detached HEAD is not a broken install; only a missing design folder or an unreadable `canvas.json` is.
- `doctor` never writes. Every fix is a command it prints, and `irsim init` already does the writes.
- A dirty tree is context, not a warning: the canvas is for work in progress.
- Settings is one scrollable dialog over tabs: the content is short, and a tab row would hide the health result behind a click.
- The manual update check calls `/api/version` without `latest=0` over the cached hourly poll: the button is about asking now.
- The dialog goes in the zoom menu as well as the page index: the canvas has no other chrome to hang it on, and the zoom menu already holds the theme switch.

## Milestones

1. Boards: `CanvasSettings` and its state boards, `CanvasAppSettings`, `CanvasZoomBar`, `CanvasPages`, `CanvasApp`, positions and table rows. Check, then stop for confirmation.
2. `bin/lib/doctor.mjs`: context and checks, `formatDoctor`. Tests.
3. `irsim doctor` in `bin/irsim`, help, README.
4. `GET /api/doctor`, 409 without a launcher.
5. `canvas/settings-dialog.tsx`, `canvas/use-doctor.ts`, `useTheme().set`; wired into the zoom menu, the page index and search.
6. `AGENTS.md` table rows; plugin `/irsim-doctor` and the `doctor` tool action.
7. Verify: tests, typecheck, lint, `design_canvas check` on `canvas-app`, Playwright board-against-app comparison light and dark.

## Risks

- The plugin and the app read `context.branch` and friends from the launcher, so a project without `irsim serve` gets no doctor in the canvas. The dialog names that instead of showing an empty panel.
- `irsim doctor` spawns `git` several times and probes the port. It is still one short command; the canvas runs it on demand, never on a timer.
- A release ships `bin/lib/` and `bin/irsim`, so the launcher path holds in an install and in a checkout.
