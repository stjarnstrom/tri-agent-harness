#!/bin/bash
# harness-runtime-run-loop.sh — Run the harness-runtime autonomous loop helpers
#
# Prefer ./harness.sh for Claude Code builds. This script drives the Node
# state machine (validate / plan / build / qa) used by harness helpers.
#
# Usage:
#   scripts/harness-runtime-run-loop.sh "Build a kanban board"

set -euo pipefail

PROMPT="${1:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -z "$PROMPT" ]; then
  node harness-runtime/cli.mjs run-loop --continue
  exit $?
fi

node harness-runtime/cli.mjs run-loop --prompt "$PROMPT"
