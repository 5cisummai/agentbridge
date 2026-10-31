#!/usr/bin/env bash
set -euo pipefail

VERSION="${CLITHREAD_VERSION:-${AGENTBRIDGE_VERSION:-0.1.0}}"
REPO="${CLITHREAD_REPO:-${AGENTBRIDGE_REPO:-5cisummai/clithread}}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin|linux) ;;
  *)
    echo "Unsupported operating system: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

BIN_NAME="clithread-${OS}-${ARCH}"
BASE_URL="${CLITHREAD_INSTALL_BASE:-${AGENTBRIDGE_INSTALL_BASE:-https://github.com/${REPO}/releases/download/v${VERSION}}}"
URL="${BASE_URL%/}/${BIN_NAME}"
DEST="${CLITHREAD_INSTALL_DIR:-${AGENTBRIDGE_INSTALL_DIR:-$HOME/.local/bin}}"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

mkdir -p "$DEST"

echo "Downloading ${URL}"
if ! curl --fail --location --silent --show-error --retry 3 "$URL" -o "$TMP_FILE"; then
  echo "Release asset not found. Install from source with:" >&2
    echo "  cd runner && cargo install --path . --locked" >&2
  exit 1
fi

if [ "${CLITHREAD_VERIFY:-${AGENTBRIDGE_VERIFY:-0}}" = "1" ]; then
  CHECKSUMS_FILE="$(mktemp)"
  trap 'rm -f "$TMP_FILE" "$CHECKSUMS_FILE"' EXIT
  CHECKSUMS_URL="${BASE_URL%/}/SHA256SUMS"

  echo "Verifying ${BIN_NAME}"
  curl --fail --location --silent --show-error --retry 3 "$CHECKSUMS_URL" -o "$CHECKSUMS_FILE"
  EXPECTED="$(awk -v asset="$BIN_NAME" '$2 == asset { print $1; exit }' "$CHECKSUMS_FILE")"
  if [ -z "$EXPECTED" ]; then
    echo "No checksum found for ${BIN_NAME}" >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL="$(sha256sum "$TMP_FILE" | awk '{ print $1 }')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL="$(shasum -a 256 "$TMP_FILE" | awk '{ print $1 }')"
  else
    echo "CLITHREAD_VERIFY=1 requires sha256sum or shasum" >&2
    exit 1
  fi

  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum verification failed for ${BIN_NAME}" >&2
    exit 1
  fi
fi

install -m 0755 "$TMP_FILE" "${DEST}/clithread"
echo "Installed clithread ${VERSION} to ${DEST}/clithread"

case ":${PATH:-}:" in
  *":${DEST}:"*) ;;
  *)
    echo "Add ${DEST} to PATH to run clithread directly."
    ;;
esac
