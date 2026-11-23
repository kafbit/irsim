---
name: irsim-stop
description: Stop listening for irsim comments. Use when the user runs /irsim-stop or asks to disconnect this session from the irsim design canvas.
---

# /irsim-stop

Stop listening for irsim canvas comments in this session.

1. Call the `design_canvas` MCP tool with `{"action": "stop"}`.
2. Confirm briefly to the user that the session stopped listening (and that running `/irsim` resumes it).
