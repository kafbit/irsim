#!/usr/bin/env bash
set -euo pipefail

repo="kafbit/irsim"
prefix="${IRSIM_PREFIX:-$HOME/.local/share/irsim}"
bin_dir="${IRSIM_BIN_DIR:-$HOME/.local/bin}"
requested="${IRSIM_VERSION:-latest}"

command -v gh >/dev/null || { echo "install: gh is required, see https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "install: run gh auth login first, the repository is private" >&2; exit 1; }
command -v node >/dev/null || { echo "install: node is required" >&2; exit 1; }

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "install: unsupported OS $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "install: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

if [ "$requested" = latest ]; then
  tag="$(gh release view --repo "$repo" --json tagName --jq .tagName)"
else
  tag="v${requested#v}"
fi
version="${tag#v}"
asset="irsim-$version-$os-$arch.tar.gz"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "install: downloading $asset"
gh release download "$tag" --repo "$repo" --pattern "$asset" --dir "$work"

mkdir -p "$prefix" "$bin_dir"
target="$prefix/$version"
rm -rf "$target.partial" "$target"
mkdir -p "$target.partial"
tar -xzf "$work/$asset" -C "$target.partial" --strip-components=1
mv "$target.partial" "$target"

ln -sfn "$version" "$prefix/.current.new"
mv -T "$prefix/.current.new" "$prefix/current" 2>/dev/null || { rm -f "$prefix/current"; mv "$prefix/.current.new" "$prefix/current"; }
ln -sfn "$prefix/current/bin/irsim" "$bin_dir/irsim"

echo "install: irsim $version installed in $target"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "install: add $bin_dir to PATH" ;;
esac
cat <<MSG

next:
  irsim init
  claude plugin marketplace add kafbit/irsim && claude plugin install irsim@kafbit
MSG
