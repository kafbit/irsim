# Agent logos

## Goal

- Keep the logos of popular coding agents in the app and show which agent a session or a reply belongs to: the session row and menu, the Claude reply header in a comment thread, the session line in the inspector boxes, and a new Agents section in Settings.

## Approach

- Today only the Claude Code plugin registers sessions (`plugin/hooks/api.ts` posts `{ id, label, cwd }`). Every live session is Claude Code, so other logos show only once another agent registers through `POST /api/sessions`. This plan adds the field and the logos; it builds no Codex, Gemini or Cursor integration.
- `Session` gets `agent?: AgentId`. `POST /api/sessions` accepts it and stores it; a missing or unknown value is `claude-code`, so old plugins keep working. The plugin sends `agent: 'claude-code'`.
- A Claude reply stores the `agent` of the session that wrote it, read from the session at `addReply` time, so the logo survives after the session ends. `Reply.author` stays `'claude' | 'user'` in storage.
- `app/src/ui/agents.ts` holds the registry: id, display name, 24x24 SVG path, source. `AgentLogo` renders it in `currentColor` at 14 or 16 px.
- Boards inline the same SVG paths. No board loads an image file.

## Agents

| id | Name | Logo source |
|---|---|---|
| `claude-code` | Claude Code | simple-icons `claude` |
| `codex` | Codex | letter mark "C" in a rounded square (simple-icons removed the OpenAI mark at OpenAI's request) |
| `gemini-cli` | Gemini CLI | simple-icons `googlegemini` |
| `copilot` | GitHub Copilot | simple-icons `githubcopilot` |
| `cursor` | Cursor | simple-icons `cursor` |
| `opencode` | OpenCode | simple-icons `opencode` |
| `windsurf` | Windsurf | simple-icons `windsurf` |
| `cline` | Cline | simple-icons `cline` |
| `other` | Agent | the existing terminal icon |

## Where it shows

- `CanvasSession` (sidebar and comments footer): the logo replaces the green dot; a 6 px green dot sits on the logo's lower right corner for "listening". Each menu entry starts with its logo. The none state keeps the dashed row with no logo.
- `CanvasThread` reply header: logo, then the agent name ("Claude Code"), then the session title muted when several sessions are live. Today it reads "Claude".
- `CanvasInspector` Variants and Approval boxes: "Session: irsim c73cd9" becomes the logo and the session title, with the same picker behaviour.
- `CanvasSettings`: a new Agents section after Project. It lists live sessions (logo, title, branch, "listening") and, under them, "Works with" and the supported agents as logo chips. With none live: "No agent connected. Run /irsim in Claude Code."
- Health rows: `review-copilot` gets the Copilot logo, the other rows keep their icons.

## Decisions

- Monochrome logos in `currentColor`: the board rules allow only theme tokens, and brand colours would break dark mode contrast.
- Path data copied from simple-icons 16.37.0 (CC0-1.0) into `agents.ts`, not the npm package: 8 paths do not justify a 3 MB dependency.
- Codex has no logo: the OpenAI mark is not in simple-icons and OpenAI asked for its removal, so a letter mark avoids using it without permission.
- Copy that says "Claude" ("No Claude session listening", "Run /irsim in Claude Code") stays, because Claude Code is the only agent that connects today.

## Risks

- The logos are trademarks of their owners. Showing them to identify the agent a session runs is nominative use; the source file names each owner.
- An agent other than Claude Code cannot connect yet, so the other logos show only in the Settings "Works with" list. Drop that list if it reads as a claim of support.
