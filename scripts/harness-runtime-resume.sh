#!/bin/bash
# harness-runtime-resume.sh — Resolve next deterministic harness action

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

node harness-runtime/cli.mjs resume "$@"
