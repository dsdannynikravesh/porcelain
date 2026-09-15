#!/usr/bin/env bash
# Compile a standalone porcelain binary for the HOST platform.
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

out="dist/porcelain-${os}-${arch}"
echo "→ $out  (target $target)"
bun build ./src/index.tsx --compile --target="$target" --outfile "$out"

# Bun executables cannot run OpenTUI's Tree-sitter worker from their virtual
# filesystem. Keep its worker, grammars, and native renderer next to the binary.
asset_dir="${out}.assets"
core_assets="${asset_dir}/@opentui/core"
mkdir -p "$core_assets" "${asset_dir}/web-tree-sitter" "${asset_dir}/@opentui/core-${os}-${arch}"
cp node_modules/@opentui/core/parser.worker.js "$core_assets/parser.worker.js"
cp -R node_modules/@opentui/core/assets "$core_assets/"
cp node_modules/web-tree-sitter/tree-sitter.wasm "${asset_dir}/web-tree-sitter/tree-sitter.wasm"
case "$os" in
  darwin) native_lib="libopentui.dylib" ;;
  linux) native_lib="libopentui.so" ;;
esac
cp "node_modules/@opentui/core-${os}-${arch}/${native_lib}" "${asset_dir}/@opentui/core-${os}-${arch}/${native_lib}"
echo "done"
