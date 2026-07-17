#!/bin/bash
# harness.sh — Combined three-agent harness with guardrails
#
# Orchestrates Planner -> Generator -> [Pre-QA Gate] -> Evaluator
# Environment constraints: hooks, lints, sandbox (see harness/AGENT-INSTRUCTIONS.md)
#
# Usage:
#   ./harness.sh "Build a project management tool"
#   ./harness.sh "Build a DAW in the browser" 5
#   HARNESS_ON_MAX_ROUNDS=advance ./harness.sh "..."  # advance on persistent failure
#   HARNESS_PAUSE=sprint ./harness.sh "..."          # confirm before each sprint
#   HARNESS_MAX_SPRINTS_PER_RUN=1 ./harness.sh "..." # one sprint per invocation
#
# Setup (first time):
#   bun install && bun run setup

set -euo pipefail

PROMPT="${1:?Usage: ./harness.sh \"your product prompt here\" [max_qa_rounds]}"
MAX_QA_ROUNDS="${2:-3}"
# HARNESS_MODEL: optional override (e.g. claude-opus-4-6, opus). When unset,
# Claude Code uses its configured default (typically latest Opus).
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_SOURCE="harness.sh"

cd "$PROJECT_DIR"
source "$PROJECT_DIR/scripts/harness-common.sh"

harness_validate_run_config "$MAX_QA_ROUNDS"

# ─── Per-agent model policy ──────────────────────────────────────────
# Default: Fable for big-picture reasoning (Planner + Evaluator/QA review),
# Sonnet for implementation (Generator). Rationale: reasoning-heavy, low-volume
# phases get the strongest model; the highest-token-volume phase (Generator)
# gets the cheaper coding-tuned model.
#
# Overrides (most specific wins):
#   HARNESS_MODEL              — force ONE model for ALL phases (global escape hatch)
#   HARNESS_PLANNER_MODEL      — Planner only
#   HARNESS_GENERATOR_MODEL    — Generator only
#   HARNESS_EVALUATOR_MODEL    — Evaluator only
# If Fable is unavailable in this environment, set the planner/evaluator vars
# to claude-opus-4-8 (the natural big-picture/analysis fallback).
HARNESS_PLANNER_MODEL="${HARNESS_PLANNER_MODEL:-claude-fable-5}"
HARNESS_GENERATOR_MODEL="${HARNESS_GENERATOR_MODEL:-claude-sonnet-5}"
HARNESS_EVALUATOR_MODEL="${HARNESS_EVALUATOR_MODEL:-claude-fable-5}"
HARNESS_RETRO_MODEL="${HARNESS_RETRO_MODEL:-claude-fable-5}"

# A global HARNESS_MODEL, if set, overrides every phase.
PLANNER_MODEL="${HARNESS_MODEL:-$HARNESS_PLANNER_MODEL}"
GENERATOR_MODEL="${HARNESS_MODEL:-$HARNESS_GENERATOR_MODEL}"
EVALUATOR_MODEL="${HARNESS_MODEL:-$HARNESS_EVALUATOR_MODEL}"
RETRO_MODEL="${HARNESS_MODEL:-$HARNESS_RETRO_MODEL}"

# ─── Preflight ───────────────────────────────────────────────────────
harness_preflight claude node || exit 1
harness_preflight_model_ping "$PLANNER_MODEL" "$GENERATOR_MODEL" "$EVALUATOR_MODEL" || exit 1

# ─── Phase runner (contract consumed by harness-common.sh) ──────────
run_phase_agent() {
  local phase="${1:?phase required (planner|generator|evaluator)}"
  local sprint="${2:?sprint required}"
  local phase_prompt="${3:?prompt required}"
  local model

  case "$phase" in
    planner)   model="$PLANNER_MODEL" ;;
    generator) model="$GENERATOR_MODEL" ;;
    evaluator) model="$EVALUATOR_MODEL" ;;
    *)         model="$PLANNER_MODEL" ;;
  esac

  claude --dangerously-skip-permissions \
    --model "$model" \
    -p "$phase_prompt"
}

# ─── Retrospector (cross-run learning, best-effort) ─────────────────
# Runs at the end of every run — including halts — unless HARNESS_RETRO=off.
# Failure here never fails the run: learning is best-effort.
harness_run_retrospector() {
  if [ "${HARNESS_RETRO:-on}" = "off" ]; then
    echo ""
    echo "▶ RETROSPECTOR skipped (HARNESS_RETRO=off)"
    return 0
  fi
  if ! ls docs/qa-report-sprint-*.md >/dev/null 2>&1; then
    echo ""
    echo "▶ RETROSPECTOR skipped (no QA reports to learn from)"
    return 0
  fi

  echo ""
  echo "▶ PHASE 3: RETROSPECTOR"
  echo "  Distilling lessons from this run's QA reports..."
  echo ""

  if ! claude --dangerously-skip-permissions \
    --model "$RETRO_MODEL" \
    -p "$(cat agents/retrospector.md)

$GUARDRAIL_CONTEXT
Read every docs/qa-report-sprint-*.md (the LESSON-CANDIDATES blocks) and every docs/sprint-*-contract.md.
Read harness/lessons.jsonl — the existing ledger.

Update the ledger per your instructions. Then run 'node scripts/render-lessons.mjs', then 'node scripts/validate-lessons.mjs' and fix any problems. Draft docs/proposals/guardrail-<id>.md for active lessons at 2+ strikes. Commit with message 'chore(retro): distill lessons from this run'.
$HARNESS_AUTONOMOUS_SUFFIX"; then
    echo "⚠ Retrospector failed — continuing (learning is best-effort)."
  fi
}

# Hook consumed by harness_run_sprint_loop (normal completion) and by
# handle_max_rounds (halt path) in harness-common.sh.
harness_run_retro_hook() {
  harness_run_retrospector
}

# Ensure guardrails are installed
harness_ensure_guardrails

echo "============================================"
echo "  COMBINED HARNESS: Build + Guardrails"
echo "  Prompt: $PROMPT"
echo "  Max QA rounds per sprint: $MAX_QA_ROUNDS"
echo "  On max rounds: $HARNESS_ON_MAX_ROUNDS"
if [ -n "${HARNESS_MODEL:-}" ]; then
  echo "  Model (all phases): $HARNESS_MODEL"
else
  echo "  Models: planner=$PLANNER_MODEL  generator=$GENERATOR_MODEL  evaluator=$EVALUATOR_MODEL  retro=$RETRO_MODEL"
fi
harness_print_pause_config
echo "============================================"

# ─── Phase 1: Planning ───────────────────────────────────────────────
harness_run_planning_phase "$PROMPT"

# ─── Phase 2: Sprint Loop (+ Phase 3 Retrospector via hook) ─────────
harness_run_sprint_loop "$MAX_QA_ROUNDS"

# ─── Summary ─────────────────────────────────────────────────────────
harness_print_summary "HARNESS COMPLETE"
