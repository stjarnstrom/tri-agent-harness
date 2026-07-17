#!/bin/bash
# Compatibility stub — Cursor runner lives under runners/
echo "→ Moved: use ./runners/cursor-harness.sh (see runners/README.md)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/runners/cursor-harness.sh" "$@"
