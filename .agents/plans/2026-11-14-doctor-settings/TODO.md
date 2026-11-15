# TODO · Doctor and settings

## M1 · Boards (approved; stop for confirmation before app code)

- [x] `CanvasSettings` base board: version + update, appearance, project context, health report
- [x] State boards `CanvasSettingsIdle`, `CanvasSettingsChecking`, `CanvasSettingsUnavailable`, `CanvasSettingsUpdate`
- [x] `CanvasAppSettings` state board with the dialog over the canvas
- [x] `CanvasZoomBarMenu` gains `Settings…` (board grew to 540 to fit)
- [x] `CanvasPages` gains the header `Settings` button
- [x] `CanvasApp` gains the `settings` state
- [x] Positions in `design/canvas.json`, rows in `AGENTS.md`
- [x] `design_canvas check` on `canvas-app`: 85 boards, 0 errors, 0 warnings; screenshots read

## M2 · Doctor engine

- [x] `bin/lib/doctor.mjs`: `projectRoot`, `runDoctor`, `formatDoctor`; config, rules, git and runtime checks
- [x] Tests in `app/tests/doctor.test.ts` (14)

## M3 · CLI

- [x] `irsim doctor [--json]` in `bin/irsim`, help text, exit 1 on a failure
- [x] Verified in a scratch project: `init` + `build` clear the failures

## M4 · API

- [x] `GET /api/doctor` through `IRSIM_LAUNCHER`, 409 without a launcher
- [x] Tests in `app/tests/doctor-route.test.ts` (2)

## M5 · Settings dialog

- [x] `canvas/use-doctor.ts` with `readDoctor`, `summaryOf`; tests (6)
- [x] `canvas/settings-dialog.tsx`
- [x] `useTheme().set`
- [x] `useUpdate()` gains `info` and a manual `check`
- [x] Wired into the zoom menu, the page index and global search
- [x] Board against app compared at 1440 in light and dark; differences fixed

## M6 · Plugin

- [x] `/irsim-doctor` command
- [x] `design_canvas {action: "doctor"}`
- [x] Plugin tests (cannot run here: the `claude-code` harness is not installed; `doctorLines` verified directly)

## M7 · Docs and verify

- [x] README "Settings and doctor" section
- [x] Typecheck, lint, full test suite (543 + 8 new)
- [x] `design_canvas check page canvas-app` clean
