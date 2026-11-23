---
name: irsim-doctor
description: Check the project rules, git setup and config. Use when the user runs /irsim-doctor or asks to diagnose the irsim project setup.
---

# /irsim-doctor

Run the irsim doctor checks for the current project.

1. Call the `design_canvas` MCP tool with `{"action": "doctor"}`. The tool is `design_canvas` on the irsim MCP server (named `irsim_irsim` in agy). Its arguments are given here, so call it at once: do not read its schema file, `instructions.md` or any other file first.
2. Report the doctor output clearly, highlighting any warnings, failures, and their suggested fix commands.
