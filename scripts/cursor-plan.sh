#!/bin/bash
# cursor-plan.sh — Prepare Cursor Planner phase handoff

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

PROMPT_FILE="cursor/prompts/plan.md"
RUNTIME_CONTRACT="docs/runtime-contract.md"
HANDOFF_FILE="docs/cursor-handoff.md"
USER_PROMPT="${1:-}"

if [ -z "$USER_PROMPT" ]; then
  echo "Usage: scripts/cursor-plan.sh \"product prompt\""
  exit 1
fi

for required in "$PROMPT_FILE" "agents/planner.md" "CLAUDE.md"; do
  if [ ! -f "$required" ]; then
    echo "Missing required file: $required"
    exit 1
  fi
done

mkdir -p docs

cat > "$HANDOFF_FILE" <<EOF
# Cursor Handoff

Phase: Planner
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Prompt: $USER_PROMPT

## Required Reads
- $PROMPT_FILE
- agents/planner.md
- agents/criteria/*.md
- CLAUDE.md
- design/ (if present — brief, constraints, references)
- $RUNTIME_CONTRACT

## Expected Outputs
- docs/spec.md
- docs/sprint-plan.md
- docs/sprint-status.md
- CLAUDE.md (project context updates)
EOF

echo "Prepared Planner handoff: $HANDOFF_FILE"
echo ""
echo "Open Cursor Agent Manager and run with:"
echo "1) $PROMPT_FILE"
echo "2) Product prompt: $USER_PROMPT"
