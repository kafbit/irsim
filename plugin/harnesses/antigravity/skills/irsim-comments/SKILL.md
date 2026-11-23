---
name: irsim-comments
description: Count the open irsim comments per page. Use when the user runs /irsim-comments or asks to see open design canvas comments.
---

# /irsim-comments

List and count open comments in the irsim design canvas.

1. Call the `design_canvas` MCP tool with `{"action": "comments"}` (pass `"page"` if the user specified a page id).
2. Summarize the open comment counts per page (or state that there are no open comments).
