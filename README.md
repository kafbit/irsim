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

In the canvas, a board with working controls or links between boards gets a Play button. Play runs it on the canvas or full screen (a web page board fills the window), and `<a href="Other.dc.html">` in a played board moves to that board. Details are in [docs/01-runtime.md](docs/01-runtime.md#play).

The plugin's `design_canvas` tool has a `check` action. It renders a board (or every board of a page) in headless Chromium and returns errors, an empty-render warning and a screenshot in `.irsim/checks/`. It needs an installed Chrome, Chromium, Brave or Edge, or the executable in `IRSIM_BROWSER`. The same check is at `POST /api/boards/<Board>/check` and `POST /api/pages/<page>/check`.

A selected board has an Approve button (in the inspector, and at the top of the open-alone view). It sends the chosen Claude session a turn that confirms the board, with an optional note. The board's label then shows Approved, or Changed once the content of the board or of a board it imports changes. Approve needs a running Claude session, and it is refused when the board changed while you were looking at it.

`irsim serve` prints `irsim: http://localhost:<port>`. The port is stable per project, in 3200 to 3299. `irsim port` prints it without starting the server.

Below 25% zoom the canvas shows a thumbnail of each board instead of a live frame. The server renders a missing thumbnail the first time it is shown, with an installed Chrome, Chromium, Brave or Edge run headless, or the executable in `IRSIM_BROWSER`. `irsim thumbs [--page <id>] [--board <name>] [--force]` renders them ahead of time on the running server. Thumbnails are cached in `~/.cache/irsim/thumbs`.

The plugin ships the `irsim-workflow` skill. It makes a change to what a screen shows start in the board: change the board, report its route, stop, then build the app after the user's confirmation.

## Update and uninstall

```bash
irsim update --check
irsim update
irsim uninstall [--purge] [--yes] [--dry-run]
```

`update` downloads the release asset for this platform with `gh`, switches `current` to it and refreshes the managed block in the current project. `uninstall --purge` also removes `~/.cache/irsim`.

The canvas shows a card in the sidebar and on the page index when a newer release exists. The check runs `gh release view` and is cached for 6 hours in `~/.cache/irsim/latest-release.json`, shared by every running canvas. Set `IRSIM_CACHE_DIR` to move that directory. "Update and restart" runs `irsim update` and restarts the canvas on the same port. A canvas that still runs an older version than the installed one offers a restart. A source checkout shows no card. `irsim update` keeps a version directory while a canvas runs from it.

## Develop

```bash
cd app
bun install
bun run dev
bun run typecheck
bun test --isolate
```

`make serve` runs this checkout's canvas without installing it or updating the plugin. It installs `app/node_modules` on first use, then runs `bin/irsim serve` from `PROJECT` (default: this repo), for example `make serve PROJECT=~/Projects/CRM`. `PORT` and `DESIGN_DIR` are optional. `make reload` first stops the canvas that serves `PROJECT` (an installed release, for example) and this checkout's own `next dev`, because Next allows one per checkout, then runs `make serve`. It refuses to touch a port held by another project's canvas. `make port`, `make build` and `make thumbs` run the matching `irsim` commands the same way, and `make help` lists them.

`bin/irsim serve` in a source checkout runs `next dev` in `app/`. `scripts/build-release.sh` builds `dist/irsim-<version>-<os>-<arch>.tar.gz` for the host platform. Pushing a tag `v<version>` builds all four platforms and attaches them to the release.
