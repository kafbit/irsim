#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

expected="$(node -p "require('./app/package.json').version")"
failed=0

check() {
  local file="$1" actual
  [ -f "$file" ] || return 0
  actual="$(node -p "require('./$file').version ?? ''")"
  [ -n "$actual" ] || return 0
  if [ "$actual" != "$expected" ]; then
    echo "check-versions: $file has version $actual, app/package.json has $expected" >&2
    failed=1
  fi
}

check plugin/package.json
check plugin/.claude-plugin/plugin.json
check plugin/harnesses/codex/.codex-plugin/plugin.json
check bin/package.json

if [ "$failed" = 1 ]; then
  exit 1
fi
echo "check-versions: all versions are $expected"
