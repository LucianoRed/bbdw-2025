#!/usr/bin/env sh
set -eu

# Name of the required environment variable (default: APP_REQUIRED_TOKEN)
REQUIRED_VAR_NAME="${REQUIRED_VAR_NAME:-APP_REQUIRED_TOKEN}"

# Resolve the value safely (printenv returns non-zero if not found, so ignore errors)
REQUIRED_VALUE="$(printenv "$REQUIRED_VAR_NAME" 2>/dev/null || true)"

if [ -z "${REQUIRED_VALUE:-}" ]; then
  echo "[startup][ERROR] Missing required environment variable: ${REQUIRED_VAR_NAME}" >&2
  exit 42
fi

# If we get here, the required var is set. Start a tiny web server (python http.server).
DOCROOT="/opt/www"
PORT="${PORT:-8080}"

echo "[startup][OK] Starting web server on 0.0.0.0:${PORT} (docroot: ${DOCROOT})"
exec python3 -m http.server "${PORT}" --directory "${DOCROOT}" --bind 0.0.0.0
