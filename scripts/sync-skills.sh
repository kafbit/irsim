#!/usr/bin/env bash
# Copies the shared skills in plugin/skills into the harnesses that need their own copy.
# A harness plugin is installed on its own, so it cannot link outside its folder.
# app/tests/plugin-lint.test.ts fails when a copy is out of date.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

for harness in codex antigravity; do
  for skill in irsim-design irsim-workflow; do
    mkdir -p "plugin/harnesses/$harness/skills/$skill"
    cp "plugin/skills/$skill/SKILL.md" "plugin/harnesses/$harness/skills/$skill/SKILL.md"
  done
done
echo "sync-skills: copied plugin/skills into the codex and antigravity harnesses"
