# Reply images, update progress, compact frame status

## Goal

- A reply on a comment thread carries pasted or attached images, and the agent session receives their paths.
- The canvas sees a new release within 15 minutes, and the update notice shows download progress with a percent.
- A zoomed-out frame shows its status as a colored dot, and its Play chip as an icon only.

## Approach

- Boards first: `CanvasThreadReplyImages` (prop `attach`), `UpdateNoticeUpdating` progress bar, `UpdateNoticeInstalling`, `CanvasFrameCompact`. Confirmed with `go` on 2026-11-16.
- Reply images: `Reply.images` in the store, the reply route parses `images` like a comment, `buildTurnText` lists reply image paths, the reply box in `comment-card.tsx` uses `usePastedImages` and an Attach images button.
- Update: release cache 15 min, client check every 15 min and on tab focus. `irsim update` downloads with a spawned `gh release download`, stats the growing file every 250 ms against the asset size from `gh release view --json assets`, and writes `$IRSIM_PREFIX/.update.lock/progress.json`. `GET /api/update/progress` reads it; the notice polls it while updating.
- Compact frame: the frame title is a CSS size container as wide as the frame on screen; under 200px the status words become dots and the Play chip loses its label.

## Decisions

- Attach button and paste both: paste alone is not discoverable.
- Progress from file size polling: `gh release download` writes straight to the final file, verified on v0.4.0.
- Progress file inside the update lock dir: it exists only while an update runs and is removed with the lock.
- 15 min cache: one `gh release view` per 15 min per machine, shared by every canvas.
- Container query over a zoom prop: no re-render of every frame on zoom.

## Risks

- An old launcher (before this release) writes no progress file: the notice falls back to the spinner.
- The New dot uses the info color, close to the blue prototype dot.
