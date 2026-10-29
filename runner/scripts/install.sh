#!/usr/bin/env bash
set -euo pipefail

VERSION="${AGENTBRIDGE_VERSION:-0.1.0}"
REPO="${AGENTBRIDGE_REPO:-agentbridge/agentbridge}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

BIN_NAME="agentbridge-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BIN_NAME}"

DEST="${AGENTBRIDGE_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$DEST"

echo "Downloading ${URL} (placeholder — build locally with cargo until releases exist)"
if curl -fsSL "$URL" -o "${DEST}/agentbridge" 2>/dev/null; then
  chmod +x "${DEST}/agentbridge"
  echo "Installed to ${DEST}/agentbridge"
else
  echo "Release not found. Install from source:"
  echo "  cd runner && cargo install --path . --locked"
  exit 1
fi
