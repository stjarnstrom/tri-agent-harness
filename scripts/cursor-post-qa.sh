#!/bin/bash
# cursor-post-qa.sh — Persist cross-workflow handoff after evaluator run

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f "sdk-orchestrator/cli.mjs" ]; then
  echo "Missing sdk orchestrator CLI at sdk-orchestrator/cli.mjs"
  exit 1
fi

node sdk-orchestrator/cli.mjs post-qa-write "$@"
