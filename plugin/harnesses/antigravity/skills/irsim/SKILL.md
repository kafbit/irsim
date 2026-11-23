---
name: irsim
description: Open irsim and listen for its comments. Use when the user runs /irsim or asks to open the irsim design canvas for the current project (optionally focusing a page or board).
---

# /irsim

Open the irsim design canvas for this project and listen for comments.

1. Call the `design_canvas` MCP tool with `{"action": "open"}`. The tool is `design_canvas` on the irsim MCP server (named `irsim_irsim` in agy). Its arguments are given here, so call it at once: do not read its schema file, `instructions.md` or any other file first.
   - If the user passed a page id or board name, pass it as `"target"` (or `"page"` / `"board"` if explicit).
2. Report the opened canvas URL briefly.
3. Follow the `irsim-workflow` and `irsim-design` skills for any change to what a screen shows: update the board first, check it with `design_canvas {"action": "check"}`, report its route, and wait for the user's confirmation before writing app code.
4. Comments sent from the canvas arrive automatically between turns; reply in at most three short sentences with `design_canvas {"action": "reply", "id": "…", "body": "…"}` and resolve with `{"action": "resolve", "id": "…"}`.
