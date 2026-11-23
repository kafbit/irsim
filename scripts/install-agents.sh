#!/usr/bin/env bash
# Install the irsim connectors for the agent harnesses this checkout ships.
#
#   scripts/install-agents.sh                point irsim at this checkout and link OpenCode, Pi and Command Code
#   scripts/install-agents.sh --codex        also add the Codex plugin marketplace and plugin
#   scripts/install-agents.sh --antigravity  also install the Antigravity CLI plugin
#   scripts/install-agents.sh --uninstall
#
# The links point at this checkout, so editing plugin/harnesses/* takes effect on the next
# harness start. `irsim` is pointed at this checkout's bin/irsim, because the released CLI
# may predate the bridge command the connectors use.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="${IRSIM_BIN_DIR:-$HOME/.local/bin}"
irsim_bin="$bin_dir/irsim"
previous="$bin_dir/.irsim-dev-previous"
uninstall=0
codex=0
antigravity=0
for arg in "$@"; do
  case "$arg" in
    --uninstall) uninstall=1 ;;
    --codex) codex=1 ;;
    --antigravity) antigravity=1 ;;
    -h | --help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install-agents: unknown option $arg" >&2
      exit 2
      ;;
  esac
done

link() {
  local source="$1" target="$2"
  if [ "$uninstall" = 1 ]; then
    if [ -L "$target" ] || [ -e "$target" ]; then
      rm -f "$target"
      echo "removed: $target"
    fi
    return
  fi
  mkdir -p "$(dirname "$target")"
  ln -sfn "$source" "$target"
  echo "linked: $target -> $source"
}

link "$root/plugin/harnesses/opencode/irsim.js" \
  "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/plugins/irsim.js"
link "$root/plugin/harnesses/pi/irsim.ts" \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/irsim.ts"
link "$root/plugin/harnesses/command-code/irsim.ts" \
  "${COMMANDCODE_HOME:-$HOME/.commandcode}/mods/irsim.ts"
link "$root/plugin/skills/irsim-workflow" \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/irsim-workflow"
link "$root/plugin/skills/irsim-workflow" \
  "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/skills/irsim-workflow"
link "$root/plugin/skills/irsim-design" \
  "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/irsim-design"
link "$root/plugin/skills/irsim-design" \
  "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/skills/irsim-design"
link "$root/plugin/harnesses/codex/prompts/irsim.md" \
  "${CODEX_HOME:-$HOME/.codex}/prompts/irsim.md"

if [ "$uninstall" = 1 ]; then
  if [ -e "$previous" ]; then
    target="$(cat "$previous")"
    rm -f "$irsim_bin"
    if [ -n "$target" ]; then
      ln -sfn "$target" "$irsim_bin"
      echo "restored: $irsim_bin -> $target"
    fi
    rm -f "$previous"
  elif [ -L "$irsim_bin" ] && [ "$(readlink "$irsim_bin")" = "$root/bin/irsim" ]; then
    rm -f "$irsim_bin"
    echo "removed: $irsim_bin"
  fi
  echo
  echo "The Codex plugin is removed with: codex plugin remove irsim-codex"
  echo "Its marketplace is removed with: codex plugin marketplace remove kafbit"
  echo "The Antigravity plugin is removed with: agy plugin uninstall irsim"
  exit 0
fi

mkdir -p "$bin_dir"
if [ -L "$irsim_bin" ]; then
  current="$(readlink "$irsim_bin")"
  if [ "$current" != "$root/bin/irsim" ] && [ ! -e "$previous" ]; then
    printf '%s\n' "$current" > "$previous"
  fi
elif [ -e "$irsim_bin" ]; then
  echo "install-agents: $irsim_bin is not a symlink; move it away and run again" >&2
  exit 1
fi
ln -sfn "$root/bin/irsim" "$irsim_bin"
echo "linked: $irsim_bin -> $root/bin/irsim"
echo "        (irsim serve now runs this checkout; --uninstall restores the previous link)"

if [ "$codex" = 1 ]; then
  if ! command -v codex >/dev/null 2>&1; then
    echo "install-agents: codex is not on PATH" >&2
    exit 1
  fi
  codex plugin marketplace add "$root"
  codex plugin remove irsim-codex >/dev/null 2>&1 || true
  codex plugin add irsim-codex@kafbit
else
  echo
  echo "Codex: add the plugin with"
  echo "  codex plugin marketplace add \"$root\""
  echo "  codex plugin add irsim-codex@kafbit"
fi

if [ "$antigravity" = 1 ]; then
  if ! command -v agy >/dev/null 2>&1; then
    echo "install-agents: agy is not on PATH" >&2
    exit 1
  fi
  agy plugin install "$root/plugin/harnesses/antigravity"
else
  echo
  echo "Antigravity CLI: install the plugin with"
  echo "  agy plugin install \"$root/plugin/harnesses/antigravity\""
fi

echo
echo "Restart the harness, then run /irsim inside an irsim project."
