---
description: Open the irsim design canvas and listen for its comments
---

# /irsim

Open the irsim design canvas for this project$ARGUMENTS.

Call the `design_canvas` tool from the `irsim` MCP server with `{"action":"open"}`. When the argument is a page id or a board name, pass it as `"page"` or let the tool resolve it with `"target"`.

Then follow the `irsim-workflow` skill for any change to what a screen shows: load the board first, change the board, report its route, and stop for the user before writing app code. Comments arrive as context between turns; answer each with `design_canvas {"action":"reply","id":"…","body":"…"}` and resolve it with `{"action":"resolve","id":"…"}`.
