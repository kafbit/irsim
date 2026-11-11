# irsim

irsim is a local design canvas. It draws the boards of a repository (`design/*.dc.html`) in sandboxed frames, lets you comment on a board, and delivers those comments to a Claude Code session through a plugin.

The board file format is in [docs/01-runtime.md](docs/01-runtime.md).

## Install

The repository is private, so the install uses the GitHub CLI. Run `gh auth login` first.

```bash
gh api repos/kafbit/irsim/contents/install.sh --jq .content | base64 -d | bash
```

Variables:

- `IRSIM_VERSION`: release to install, default the latest.
- `IRSIM_PREFIX`: install folder, default `~/.local/share/irsim`.

The script installs into `$IRSIM_PREFIX/<version>`, points `$IRSIM_PREFIX/current` at it and links `~/.local/bin/irsim` to `current/bin/irsim`. Node 22 or newer is required.

Install the Claude Code plugin:

```bash
claude plugin marketplace add kafbit/irsim && claude plugin install irsim@kafbit
```

## Use

In the project root:

```bash
irsim init [--design-dir <path>]
irsim serve [--design-dir <path>] [--port <n>]
```

`irsim init` writes `.irsim.json` (`{ "designDir": "design" }`), adds `.irsim/` to `.gitignore`, and adds the managed block (`<!-- IRSIM_START -->` to `<!-- IRSIM_END -->`) to `AGENTS.md` and `CLAUDE.md` when they exist. A second run changes nothing.

`irsim serve` prints `irsim: http://localhost:<port>`. The port is stable per project, in 3200 to 3299. `irsim port` prints it without starting the server.

The plugin ships the `irsim-workflow` skill. It makes a change to what a screen shows start in the board: change the board, report its route, stop, then build the app after the user's confirmation.

## Update and uninstall

```bash
irsim update --check
irsim update
irsim uninstall [--purge] [--yes] [--dry-run]
```

`update` downloads the release asset for this platform with `gh`, switches `current` to it and refreshes the managed block in the current project. `uninstall --purge` also removes `~/.cache/irsim`.

## Develop

```bash
cd app
bun install
bun run dev
bun run typecheck
bun test --isolate
```

`bin/irsim serve` in a source checkout runs `next dev` in `app/`. `scripts/build-release.sh` builds `dist/irsim-<version>-<os>-<arch>.tar.gz` for the host platform. Pushing a tag `v<version>` builds all four platforms and attaches them to the release.
