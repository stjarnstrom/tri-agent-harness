#!/bin/bash
# build.sh — Prepare Cursor Generator phase handoff

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

PROMPT_FILE="runners/cursor/prompts/build.md"
RUNTIME_CONTRACT="docs/runtime-contract.md"
STATUS_FILE="docs/sprint-status.md"
HANDOFF_FILE="docs/cursor-handoff.md"
EXTRA_CONTEXT="${1:-}"

for required in "$PROMPT_FILE" "$RUNTIME_CONTRACT" "docs/spec.md" "docs/sprint-plan.md" "$STATUS_FILE" "agents/generator.md"; do
  if [ ! -f "$required" ]; then
    echo "Missing required file: $required"
    # Single quotes: unescaped backticks in a double-quoted string would
    # execute these paths via command substitution.
    echo 'Run planning first (`./runners/cursor/plan.sh`) or `./harness.sh`.'
    exit 1
  fi
done

TARGET_INFO="$(
  awk -F'|' '
    /^\|[[:space:]]*[0-9]+/ {
      sprint=$2; status=$4
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", sprint)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
      if (status == "Not started" || status == "In progress" || status == "Fail") {
        print sprint "|" status
        exit
      }
    }
  ' "$STATUS_FILE"
)"

if [ -z "$TARGET_INFO" ]; then
  echo "No sprint ready for build. Check $STATUS_FILE."
  exit 1
fi

TARGET_SPRINT="${TARGET_INFO%%|*}"
TARGET_STATUS="${TARGET_INFO#*|}"

cat > "$HANDOFF_FILE" <<EOF
# Cursor Handoff

Phase: Generator
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Target sprint: $TARGET_SPRINT
Additional context: ${EXTRA_CONTEXT:-"(none)"}

## Required Reads
- $PROMPT_FILE
- agents/generator.md
- agents/criteria/*.md
- docs/spec.md
- docs/sprint-plan.md
- $STATUS_FILE
- CLAUDE.md
- $RUNTIME_CONTRACT

## Expected Outputs
- docs/sprint-${TARGET_SPRINT}-contract.md
- implementation changes for sprint ${TARGET_SPRINT}
- generator self-evaluation appended to contract
- docs/sprint-status.md updated to Ready for QA
EOF

echo "Prepared Generator handoff: $HANDOFF_FILE"
echo "Target sprint: $TARGET_SPRINT"
echo ""
echo "Open Cursor Agent Manager and run with:"
echo "1) $PROMPT_FILE"
echo "2) Additional context: ${EXTRA_CONTEXT:-\"(none)\"}"

# Best-effort cross-workflow handoff manifest write.
if command -v node >/dev/null 2>&1 && [ -f "sdk-orchestrator/cli.mjs" ]; then
  LAST_COMPLETED_PHASE="planner"
  if [ "$TARGET_STATUS" = "Fail" ]; then
    LAST_COMPLETED_PHASE="evaluator"
  fi

  if ! node sdk-orchestrator/cli.mjs handoff-write \
    --phase "$LAST_COMPLETED_PHASE" \
    --sprint "$TARGET_SPRINT" \
    --qa-round 1 \
    --next run-generator \
    --source runners/cursor/build.sh \
    --artifacts "$HANDOFF_FILE,$STATUS_FILE"; then
    echo "Warning: failed to write docs/workflow-handoff.json"
  fi
fi
