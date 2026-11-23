---
name: irsim-comments
description: Count the open irsim comments per page. Use when the user runs /irsim-comments or asks to see open design canvas comments.
---

# /irsim-comments

List and count open comments in the irsim design canvas.

1. Call the `design_canvas` MCP tool with `{"action": "comments"}` (pass `"page"` if the user specified a page id). The tool is `design_canvas` on the irsim MCP server (named `irsim_irsim` in agy). Its arguments are given here, so call it at once: do not read its schema file, `instructions.md` or any other file first.
2. Summarize the open comment counts per page (or state that there are no open comments).
