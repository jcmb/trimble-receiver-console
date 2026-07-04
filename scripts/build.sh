#!/usr/bin/env bash
# Build trimble-console binaries (embedded web UI + Go server).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-$(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo dev)}"
export VERSION
export GOARM="${GOARM:-7}"

usage() {
  cat <<'EOF'
Usage: scripts/build.sh [TARGET]

Build the embedded web UI and Go server binaries into bin/.

Targets (default: all):
  all            Linux amd64, arm64, arm + macOS arm64
  server         Native binary for this host -> bin/trimble-console
  web            Web UI only -> cmd/server/dist
  linux-all      All Linux targets (single web build)
  linux-amd64    Linux x86_64
  linux-arm64    Linux ARM64
  linux-arm      Linux ARMv7 (GOARM default: 7)
  macos-arm64    macOS Apple Silicon

Environment:
  VERSION   Version string for UI and Go ldflags (default: git describe)
  GOARM     ARM variant for linux-arm (default: 7)

Examples:
  scripts/build.sh
  scripts/build.sh server
  GOARM=6 scripts/build.sh linux-arm
EOF
}

if ! command -v make >/dev/null 2>&1; then
  echo "error: make is required" >&2
  exit 1
fi

TARGET="${1:-all}"

case "${TARGET}" in
  -h | --help | help)
    usage
    exit 0
    ;;
  all | server | native | web | linux-all | linux-amd64 | linux-arm64 | linux-arm | macos-arm64)
    if [[ "${TARGET}" == "native" ]]; then
      TARGET=server
    fi
    make "${TARGET}"
    ;;
  *)
    echo "error: unknown target: ${TARGET}" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

echo
echo "Build complete (VERSION=${VERSION})."
if [[ -d bin ]]; then
  echo "Binaries:"
  ls -lh bin/
fi
