#!/usr/bin/env bash
set -euo pipefail

repo="kafbit/irsim"
prefix="${IRSIM_PREFIX:-$HOME/.local/share/irsim}"
bin_dir="${IRSIM_BIN_DIR:-$HOME/.local/bin}"
requested="${IRSIM_VERSION:-latest}"
mode=remote
local_dir=""
force=0
version_flag=0

usage() {
  cat <<'USAGE'
Usage: install.sh [--version <v>] [--local [<dir>]] [--force] [-h|--help]

Flags:
  --version <v>    install release <v> (0.2.1 or v0.2.1), default the latest
  --local [<dir>]  build and install a checkout of irsim, default the folder of install.sh or the current folder
  --force          download and replace a version that is already installed
  -h, --help       print this help

Environment:
  IRSIM_PREFIX     install folder, default ~/.local/share/irsim
  IRSIM_BIN_DIR    folder of the irsim link, default ~/.local/bin
  IRSIM_VERSION    release to install, default latest, overridden by --version

Examples:
  curl -fsSL https://raw.githubusercontent.com/kafbit/irsim/main/install.sh | bash -s -- --version 0.2.1
  ./install.sh --local
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || { echo "install: --version needs a value" >&2; usage >&2; exit 2; }
      requested="$2"
      version_flag=1
      shift 2
      ;;
    --version=*)
      requested="${1#--version=}"
      version_flag=1
      shift
      ;;
    --local)
      mode=local
      if [ $# -ge 2 ] && [ "${2#-}" = "$2" ]; then
        local_dir="$2"
        shift 2
      else
        shift
      fi
      ;;
    --force)
      force=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "install: unknown argument $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$mode" = local ] && [ "$version_flag" = 1 ]; then
  echo "install: --version and --local cannot be used together" >&2
  usage >&2
  exit 2
fi

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

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

extract() {
  local tarball="$1" target="$2"
  mkdir -p "$prefix"
  rm -rf "$target.partial" "$target"
  mkdir -p "$target.partial"
  tar -xzf "$tarball" -C "$target.partial" --strip-components=1
  mv "$target.partial" "$target"
}

link_bin() {
  mkdir -p "$bin_dir"
  ln -sfn "$prefix/current/bin/irsim" "$bin_dir/irsim"
}

activate() {
  local name="$1"
  mkdir -p "$prefix"
  ln -sfn "$name" "$prefix/.current.new"
  mv -T "$prefix/.current.new" "$prefix/current" 2>/dev/null || { rm -f "$prefix/current"; mv "$prefix/.current.new" "$prefix/current"; }
  link_bin
}

finish() {
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) echo "install: add $bin_dir to PATH" ;;
  esac
  cat <<'MSG'

next:
  irsim init
  claude plugin marketplace add kafbit/irsim && claude plugin install irsim@kafbit
MSG
}

install_remote() {
  local tag version asset target use_gh=0
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    use_gh=1
  else
    command -v curl >/dev/null || { echo "install: curl or an authenticated gh is required" >&2; exit 1; }
  fi

  if [ "$requested" = latest ]; then
    if [ "$use_gh" = 1 ]; then
      tag="$(gh release view --repo "$repo" --json tagName --jq .tagName)"
    else
      tag="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
      [ -n "$tag" ] || { echo "install: could not read the latest release of $repo" >&2; exit 1; }
    fi
  else
    tag="v${requested#v}"
    if [ "$use_gh" = 1 ]; then
      if ! gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
        echo "install: no release $tag in $repo" >&2
        gh release list --repo "$repo" --limit 10 >&2 || true
        exit 1
      fi
    elif ! curl -fsSL "https://api.github.com/repos/$repo/releases/tags/$tag" >/dev/null 2>&1; then
      echo "install: no release $tag in $repo" >&2
      exit 1
    fi
  fi
  version="${tag#v}"
  asset="irsim-$version-$os-$arch.tar.gz"
  target="$prefix/$version"

  if [ "$force" = 0 ] && [ -x "$target/bin/irsim" ]; then
    if [ "$(readlink "$prefix/current" 2>/dev/null || true)" = "$version" ]; then
      link_bin
      echo "install: irsim $version is already installed in $target"
    else
      activate "$version"
      echo "install: switched to irsim $version"
    fi
    exit 0
  fi

  echo "install: downloading $asset"
  if [ "$use_gh" = 1 ]; then
    gh release download "$tag" --repo "$repo" --pattern "$asset" --dir "$work"
  else
    curl -fsSL -o "$work/$asset" "https://github.com/$repo/releases/download/$tag/$asset"
  fi
  extract "$work/$asset" "$target"
  printf '%s-%s\n' "$version" "$(date +%s)" > "$target/BUILD"
  activate "$version"
  echo "install: irsim $version installed in $target"
  finish
}

install_local() {
  local dir="" self="" output tarball name version target
  if [ -n "$local_dir" ]; then
    dir="$local_dir"
  else
    self="${BASH_SOURCE[0]:-}"
    if [ -n "$self" ] && [ -f "$self" ] && [ -f "$(cd "$(dirname "$self")" && pwd)/scripts/build-release.sh" ]; then
      dir="$(cd "$(dirname "$self")" && pwd)"
    else
      dir="$PWD"
    fi
  fi
  if [ ! -f "$dir/scripts/build-release.sh" ]; then
    echo "install: --local needs a checkout of irsim (no scripts/build-release.sh in $dir)" >&2
    exit 1
  fi
  dir="$(cd "$dir" && pwd)"
  command -v bun >/dev/null || { echo "install: bun is required for --local, see https://bun.sh" >&2; exit 1; }

  echo "install: building irsim in $dir"
  output="$work/build.log"
  "$dir/scripts/build-release.sh" | tee "$output"
  tarball="$(tail -n 1 "$output")"
  tarball="${tarball#build-release: }"
  [ -f "$tarball" ] || { echo "install: build-release did not produce a tarball" >&2; exit 1; }

  name="$(basename "$tarball" .tar.gz)"
  version="$(tar -xzOf "$tarball" "$name/VERSION" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -z "$version" ]; then
    version="${name#irsim-}"
    version="${version%-"$os"-"$arch"}"
  fi

  target="$prefix/$version-local"
  extract "$tarball" "$target"
  printf '%s-%s\n' "$version" "$(date +%s)" > "$target/BUILD"
  activate "$version-local"
  echo "install: irsim $version (local build of $dir) installed in $target"
  finish
}

if [ "$mode" = local ]; then
  install_local
else
  install_remote
fi
