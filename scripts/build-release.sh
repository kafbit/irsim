#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app="$root/app"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "build-release: unsupported OS $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "build-release: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

version="$(bun -e "console.log(require('$app/package.json').version)")"
name="irsim-$version-$os-$arch"
dist="$root/dist"
stage="$dist/$name"

(cd "$app" && bun install --frozen-lockfile && bun run build)

rm -rf "$stage" "$dist/$name.tar.gz"
mkdir -p "$stage/bin" "$stage/server"

cp "$root/bin/irsim" "$root/bin/package.json" "$stage/bin/"
chmod +x "$stage/bin/irsim"
cp -R "$app/.next/standalone/." "$stage/server/"
mkdir -p "$stage/server/.next"
cp -R "$app/.next/static" "$stage/server/.next/static"
mkdir -p "$stage/server/public"
cp -R "$app/public/." "$stage/server/public/"
cp -R "$root/templates" "$stage/templates"
cp -R "$root/plugin" "$stage/plugin"
printf '%s\n' "$version" > "$stage/VERSION"

tar -czf "$dist/$name.tar.gz" -C "$dist" "$name"
echo "build-release: $dist/$name.tar.gz"
