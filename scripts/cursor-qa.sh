#!/bin/bash
# Compatibility stub — Cursor handoffs live under runners/cursor/
echo "→ Moved: use ./runners/cursor/qa.sh (see runners/README.md)" >&2
exec "$(cd "$(dirname "$0")/.." && pwd)/runners/cursor/qa.sh" "$@"
