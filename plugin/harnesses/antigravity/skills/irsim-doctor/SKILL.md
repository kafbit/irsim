---
name: irsim-doctor
description: Check the project rules, git setup and config. Use when the user runs /irsim-doctor or asks to diagnose the irsim project setup.
---

# /irsim-doctor

Run the irsim doctor checks for the current project.

1. Call the `design_canvas` MCP tool with `{"action": "doctor"}`.
2. Report the doctor output clearly, highlighting any warnings, failures, and their suggested fix commands.
