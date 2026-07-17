#!/bin/bash
# Compatibility stub — OpenCode runner lives under runners/
echo "→ Moved: use ./runners/opencode-harness.sh (see runners/README.md)" >&2
exec "$(cd "$(dirname "$0")" && pwd)/runners/opencode-harness.sh" "$@"
