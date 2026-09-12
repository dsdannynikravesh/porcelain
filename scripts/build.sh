#!/usr/bin/env bash
# Compile a standalone gitpretty binary for the HOST platform.
#
# Cross-compilation is not possible here: OpenTUI ships its Zig renderer as a
# per-platform native package (`@opentui/core-<os>-<arch>`), and only the host's
# package is installed by `bun install`. To produce macOS *and* Linux binaries,
# run this on each OS (e.g. a CI matrix with macos-latest + ubuntu-latest) and
# collect the artifacts.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64) arch="x64" ;;
  aarch64) arch="arm64" ;;
esac
case "$os" in
  darwin) target="bun-darwin-$arch" ;;
  linux) target="bun-linux-$arch" ;;
  *) echo "unsupported host OS: $os" >&2; exit 1 ;;
esac

out="dist/gitpretty-${os}-${arch}"
echo "→ $out  (target $target)"
bun build ./src/index.tsx --compile --target="$target" --outfile "$out"
echo "done"
