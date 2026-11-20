# Open source release and connector packages

## Goal
`kafbit/irsim` becomes a public repository under AGPL-3.0 with a commercial `ee/` folder reserved for the cloud product.
Pi, OpenCode and Command Code install the irsim connectors as an npm package, so their own update checks report a new irsim release.

## Approach
- `LICENSE` holds AGPL-3.0. `ee/LICENSE` holds the Kafbit commercial license text and states that code under `ee/` is not AGPL. `ee/` holds only that license and a README until the cloud work starts.
- `plugin/.claude-plugin/plugin.json` and `plugin/harnesses/codex/.codex-plugin/plugin.json` change `MIT` to `AGPL-3.0-only` where a license field exists.
- One npm package `@kafbit/irsim-connectors`, rooted at `plugin/`, version equal to `app/package.json`.
- `plugin/package.json` declares each harness entry in that harness's manifest key: `pi.extensions` and `pi.skills`, `commandcode.mods` and `commandcode.skills`, `exports["./server"]` for OpenCode.
- `files` ships only the three connectors and `skills/irsim-workflow`.
- `scripts/check-versions.sh` fails when `plugin/package.json`, the Claude Code manifest or the Codex manifest differs from `app/package.json`. `ci.yml` and `release.yml` run it.
- `release.yml` gets an `npm` job after `build` that publishes with npm trusted publishing and provenance.
- README: install table with the harness commands, update commands, license section. `scripts/install-agents.sh` stays for working on a checkout.
- The repository visibility changes with `gh repo edit kafbit/irsim --visibility public --accept-visibility-change-consequences` after the license commit is on `main`.

## Decisions
- AGPL core with `ee/`: self-hosting stays free, a closed competing SaaS built on irsim is not allowed, and the cloud code can live in the same monorepo (the Cal.com and Documenso model).
- npm over a git source: Pi and OpenCode check only unpinned git sources, which track `main` (105 commits this month), and a connector on `main` can call a `bridge` command the installed CLI lacks.
- One package for three harnesses: each harness reads only its own manifest key.
- Scoped `@kafbit/irsim-connectors`, matching the GitHub org. Fallback: unscoped `irsim-connectors`.
- Plugin manifest versions follow the release, because Claude Code and Codex compare `version` to detect a plugin update. The Codex manifest is at 0.3.0 while the release is 0.4.0.
- Pi host packages go in optional `peerDependencies` with `"*"`, as Pi's packages doc requires.
- `.agents/plans/` stays tracked and becomes public with the repository.

## Research
- Pi 1.4.0 `checkForAvailableUpdates`: npm sources compare the installed version with the registry; git sources compare `git ls-remote HEAD`; any git ref counts as pinned and is skipped.
- OpenCode 2.1.4: `opencode plugin add|check|update`; startup checks unpinned npm and git plugins (https://opencode.ai/docs/plugins/).
- Command Code 1.91.1: `commandcode mods add|update` with `npm:` and `git:` sources and a `commandcode` key in `package.json`. No update notice for mods.
- `gitleaks git` on the full history: 84 commits, no leaks found.

## Risks
- Command Code shows no notice. It updates on `commandcode mods update`.
- OpenCode docs do not state whether the startup check shows a notice.
- OpenCode has no documented way for a plugin package to ship a skill, so OpenCode keeps the skill link step.
- The commit author emails in the history become public. Rewriting history is out of scope.
- The first npm publish needs the npm org `kafbit` and a trusted publisher entry for `release.yml`. Only the user can create them.
