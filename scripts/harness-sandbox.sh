#!/usr/bin/env bash
# Thin wrapper: run the harness inside the Docker/Podman jail.
# Equivalent to: ./harness.sh --sandbox "$@"
#
# Usage:
#   ./scripts/harness-sandbox.sh "Build a kanban board" 5
#   ./scripts/harness-sandbox.sh --backend=claude "Build a kanban board"

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="docker"

if [ "${1:-}" = "--backend=claude" ] || [ "${1:-}" = "--backend=docker" ]; then
  BACKEND="${1#--backend=}"
  shift
fi

export HARNESS_ISOLATION="$BACKEND"
exec "$ROOT/harness.sh" --sandbox="$BACKEND" "$@"
