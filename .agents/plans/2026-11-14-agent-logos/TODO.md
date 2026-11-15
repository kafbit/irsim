# Agent logos

- [ ] Boards: `CanvasSession` logo and menu logos, `CanvasThread` reply header, `CanvasInspector` session line, `CanvasSettings` Agents section and Copilot row; new `CanvasSettingsAgents` and `CanvasSettingsNoAgent` wrappers; `canvas.json` positions; `AGENTS.md` table. Check the page.
- [ ] Stop for board approval.
- [ ] `ui/agents.ts` registry and `AgentLogo`; `Session.agent` and `Reply.agent` in both type files; `api/sessions` accepts `agent`; `addReply` stores the session's agent; plugin sends `agent: 'claude-code'`; tests.
- [ ] `session-row.tsx` and `session-picker.tsx` logos; inspector boxes use `SessionRow`.
- [ ] `comment-card.tsx` reply header.
- [ ] `settings-dialog.tsx` Agents section and Copilot row logo.
- [ ] Compare app and boards, light and dark.
- [ ] Typecheck, lint, affected tests, plugin tests, page check.
