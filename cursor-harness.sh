#!/bin/bash
# cursor-harness.sh — Combined three-agent harness via Cursor CLI
#
# Orchestrates Planner -> Generator -> [Pre-QA Gate] -> Evaluator
# Environment constraints: hooks, lints, sandbox (see harness/AGENT-INSTRUCTIONS.md)
#
# Usage:
#   ./cursor-harness.sh "Build a project management tool"
#   ./cursor-harness.sh "Build a DAW in the browser" 5
#   HARNESS_ON_MAX_ROUNDS=advance ./cursor-harness.sh "..."
#
# Agent watchdog (default on — stops hung cursor agent after artifacts land):
#   HARNESS_AGENT_WATCHDOG=0          wait for cursor agent to exit on its own
#   HARNESS_AGENT_POLL_SEC=15         seconds between artifact checks
#   HARNESS_AGENT_STABLE_POLLS=2      consecutive ready polls before stopping
#   HARNESS_PHASE_TIMEOUT=7200        wall-clock seconds per run (0 = no limit)
#
# Setup (first time):
#   bun install && bun run setup

set -euo pipefail

PROMPT="${1:?Usage: ./cursor-harness.sh \"your product prompt here\" [max_qa_rounds]}"
MAX_QA_ROUNDS="${2:-3}"
HARNESS_MODEL="${HARNESS_MODEL:-composer-2.5}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_SOURCE="cursor-harness.sh"

cd "$PROJECT_DIR"
source "$PROJECT_DIR/scripts/harness-common.sh"

harness_validate_run_config "$MAX_QA_ROUNDS"

# ─── Phase runner (contract consumed by harness-common.sh) ──────────
# run_cursor_agent wraps run_agent_with_watchdog.
run_phase_agent() {
  run_cursor_agent "$@"
}

# Ensure guardrails are installed
harness_ensure_guardrails

echo "============================================"
echo "  COMBINED CURSOR HARNESS: Build + Guardrails"
echo "  Prompt: $PROMPT"
echo "  Max QA rounds per sprint: $MAX_QA_ROUNDS"
echo "  On max rounds: $HARNESS_ON_MAX_ROUNDS"
echo "  Model: $HARNESS_MODEL"
harness_print_pause_config
echo "============================================"

# ─── Phase 1: Planning ───────────────────────────────────────────────
harness_run_planning_phase "$PROMPT"

# ─── Phase 2: Sprint Loop ───────────────────────────────────────────
harness_run_sprint_loop "$MAX_QA_ROUNDS"

# ─── Summary ─────────────────────────────────────────────────────────
harness_print_summary "CURSOR HARNESS COMPLETE"
