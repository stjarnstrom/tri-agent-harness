#!/bin/bash
# qa.sh — Prepare Cursor Evaluator phase handoff

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

PROMPT_FILE="runners/cursor/prompts/qa.md"
RUNTIME_CONTRACT="docs/runtime-contract.md"
STATUS_FILE="docs/sprint-status.md"
HANDOFF_FILE="docs/cursor-handoff.md"

for required in "$PROMPT_FILE" "$RUNTIME_CONTRACT" "docs/spec.md" "$STATUS_FILE" "agents/evaluator.md"; do
  if [ ! -f "$required" ]; then
    echo "Missing required file: $required"
    echo "Run planning and build first."
    exit 1
  fi
done

TARGET_SPRINT="$(
  awk -F'|' '
    /^\|[[:space:]]*[0-9]+/ {
      sprint=$2; status=$4
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", sprint)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
      if (status == "Ready for QA") {
        print sprint
        exit
      }
    }
  ' "$STATUS_FILE"
)"

if [ -z "$TARGET_SPRINT" ]; then
  echo "No sprint marked Ready for QA. Check $STATUS_FILE."
  exit 1
fi

CONTRACT_FILE="docs/sprint-${TARGET_SPRINT}-contract.md"
if [ ! -f "$CONTRACT_FILE" ]; then
  echo "Missing sprint contract for QA target: $CONTRACT_FILE"
  exit 1
fi

cat > "$HANDOFF_FILE" <<EOF
# Cursor Handoff

Phase: Evaluator
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Target sprint: $TARGET_SPRINT

## Required Reads
- $PROMPT_FILE
- agents/evaluator.md
- agents/criteria/*.md
- docs/spec.md
- $STATUS_FILE
- $CONTRACT_FILE
- $RUNTIME_CONTRACT

## Expected Outputs
- docs/qa-report-sprint-${TARGET_SPRINT}.md
- docs/sprint-status.md updated with Pass or Fail
EOF

echo "Prepared Evaluator handoff: $HANDOFF_FILE"
echo "Target sprint: $TARGET_SPRINT"
echo ""
echo "Open Cursor Agent Manager and run with:"
echo "1) $PROMPT_FILE"

# Best-effort cross-workflow handoff manifest write.
if command -v node >/dev/null 2>&1 && [ -f "sdk-orchestrator/cli.mjs" ]; then
  QA_ROUND=1
  if [ -f "docs/qa-report-sprint-${TARGET_SPRINT}.md" ]; then
    QA_ROUND=2
  fi

  if ! node sdk-orchestrator/cli.mjs handoff-write \
    --phase generator \
    --sprint "$TARGET_SPRINT" \
    --qa-round "$QA_ROUND" \
    --next run-evaluator \
    --source runners/cursor/qa.sh \
    --artifacts "$HANDOFF_FILE,$STATUS_FILE,$CONTRACT_FILE"; then
    echo "Warning: failed to write docs/workflow-handoff.json"
  fi
fi
