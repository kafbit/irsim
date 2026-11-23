---
name: irsim-stop
description: Stop listening for irsim comments. Use when the user runs /irsim-stop or asks to disconnect this session from the irsim design canvas.
---

# /irsim-stop

Stop listening for irsim canvas comments in this session.

1. Call the `design_canvas` MCP tool with `{"action": "stop"}`. The tool is `design_canvas` on the irsim MCP server (named `irsim_irsim` in agy). Its arguments are given here, so call it at once: do not read its schema file, `instructions.md` or any other file first.
2. Confirm briefly to the user that the session stopped listening (and that running `/irsim` resumes it).
