#!/bin/sh
# usage: scripts/reload.sh <project> [port]
# Stops the canvas that serves <project> and the dev server of this checkout, so `irsim serve` can start the checkout's own server.
# DRY_RUN=1 only prints what would be stopped.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
project=$(cd "${1:-$root}" && pwd -P)
irsim="$root/bin/irsim"
port=${2:-$(cd "$project" && "$irsim" port)}

listeners() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnHp "sport = :$1" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
  else
    lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

stop() {
  for pid in $1; do
    echo "reload: stopping $pid ($(ps -o args= -p "$pid" | cut -c1-90))"
    [ "${DRY_RUN:-}" = 1 ] || kill "$pid" 2>/dev/null || true
  done
}

held=$(listeners "$port")
if [ -n "$held" ]; then
  served=$(curl -s -m 3 "http://localhost:$port/api/health" | sed -n 's/.*"root":"\([^"]*\)".*/\1/p')
  if [ "$served" != "$project" ]; then
    echo "reload: port $port is held by something that does not serve $project, not touching it" >&2
    exit 1
  fi
  stop "$held"
fi

stop "$(pgrep -f "$root/app/node_modules/.bin/next dev" || true)"

[ "${DRY_RUN:-}" = 1 ] && exit 0

for _ in $(seq 1 50); do
  [ -z "$(listeners "$port")" ] && [ -z "$(pgrep -f "$root/app/node_modules/.bin/next dev" || true)" ] && exit 0
  sleep 0.2
done
echo "reload: the old server did not stop in 10 s" >&2
exit 1
