<!-- IRSIM_START -->
## Design boards (irsim)

The boards in `design/` are the design, shown by irsim (`irsim serve`). Load the `irsim-workflow` skill before any change to what a screen shows.

- The board changes first. Plan it as its own step, draw the new states, check it with `design_canvas {action: "check"}` until it reports ok, and look at the screenshot.
- Stop after the board change. Report the board route (`/p/<page>?board=<Board>`), the plan and the open choices, then wait for the user's separate confirmation before writing app code.
- After confirmation, read the board again and implement from it. Compare the board and the running screen with Playwright screenshots, not by reading code.
- Keep the boards in step with the app: a later screen change updates its board in the same change.
- A pull request that changes UI source must change a board, or state that nothing visible changed.
<!-- IRSIM_END -->
