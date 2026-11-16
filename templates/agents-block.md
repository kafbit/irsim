<!-- IRSIM_START -->
## Design boards (irsim)

The boards in `design/` are the design, shown by irsim (`irsim serve`). Load the `irsim-workflow` skill before any change to what a screen shows.

- The board changes first. Plan it as its own step, draw the new states, check it with `design_canvas {action: "check"}` until it reports ok, and look at the screenshot.
- The canvas has no prop switcher. Draw each state the user must see as its own state board (a `dc-import` wrapper with fixed props), group a screen's states in a section of `design/canvas.json`, and report each state board's route, never a prop value to set.
- Stop after the board change. Report the board route (`/p/<page>?board=<Board>`), the plan and the open choices, then wait for the user's separate confirmation before writing app code. An approval from the irsim Approve button is that confirmation for its board.
- After confirmation, read the board again and implement from it. Compare the board and the running screen with Playwright screenshots, not by reading code.
- Keep the boards in step with the app: a later screen change updates its board in the same change.
- A pull request that changes UI source must change a board, or state that nothing visible changed.
- A review does not review board files. It checks that the boards and the app in the pull request show the same thing; the user accepts a board by looking at it in irsim.
<!-- IRSIM_END -->
