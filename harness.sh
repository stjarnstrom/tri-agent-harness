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

claude_model_args=()
if [ -n "${HARNESS_MODEL:-}" ]; then
  claude_model_args+=(--model "$HARNESS_MODEL")
fi

# Ensure guardrails are installed
if [ ! -f ".git/hooks/pre-commit" ] && [ -d ".git" ]; then
  echo "▶ Installing harness guardrails (git hooks)..."
  bash "$PROJECT_DIR/scripts/install-harness.sh"
fi

echo "============================================"
echo "  COMBINED HARNESS: Build + Guardrails"
echo "  Prompt: $PROMPT"
echo "  Max QA rounds per sprint: $MAX_QA_ROUNDS"
echo "  On max rounds: $HARNESS_ON_MAX_ROUNDS"
if [ -n "${HARNESS_MODEL:-}" ]; then
  echo "  Model: $HARNESS_MODEL"
else
  echo "  Model: (Claude Code default)"
fi
harness_print_pause_config
echo "============================================"

# ─── Phase 1: Planning ───────────────────────────────────────────────

if harness_is_planning_complete; then
  echo ""
  echo "▶ RESUMING: Found existing spec and sprint status"
  CURRENT=$(get_current_sprint)
  if [ "$CURRENT" = "done" ]; then
    echo "  All sprints are complete!"
    exit 0
  fi
  echo "  Resuming from sprint $CURRENT"
elif harness_is_design_scout_complete && ! harness_has_selected_direction; then
  harness_handle_design_scout_complete
else
  echo ""
  echo "▶ PHASE 1: PLANNER"
  PLANNER_MODE="$(harness_get_planner_mode)"
  echo "  Planner mode: $PLANNER_MODE"
  echo "  Expanding prompt into product spec..."
  echo ""

  harness_maybe_pause_phase "planner"

  claude --dangerously-skip-permissions \
    "${claude_model_args[@]}" \
    -p "$(harness_build_planner_prompt "$PROMPT")"

  validate_phase planner 1

  if [ "$PLANNER_MODE" = "scout" ]; then
    if [ ! -f docs/design-options.md ]; then
      echo "ERROR: Planner did not produce docs/design-options.md"
      exit 1
    fi
    harness_handle_design_scout_complete
  else
    if [ ! -f docs/spec.md ]; then
      echo "ERROR: Planner did not produce docs/spec.md"
      exit 1
    fi

    write_handoff planner 1 1 run-generator \
      "docs/spec.md,docs/sprint-plan.md,docs/sprint-status.md,CLAUDE.md"

    echo ""
    echo "✓ Spec written to docs/spec.md"
  fi
fi

# ─── Phase 2: Sprint Loop ───────────────────────────────────────────
echo ""
echo "▶ PHASE 2: BUILD + QA LOOP"
echo ""

harness_maybe_pause_phase "build loop"

while true; do
  CURRENT=$(get_current_sprint)
  TOTAL=$(get_total_sprints)

  if [ "$CURRENT" = "done" ]; then
    echo ""
    echo "✅ All sprints complete!"
    break
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Sprint $CURRENT / $TOTAL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  qa_round=0

  while [ $qa_round -lt $MAX_QA_ROUNDS ]; do
    qa_round=$((qa_round + 1))
    echo ""
    echo "── QA Round $qa_round / $MAX_QA_ROUNDS ──"

    if [ $qa_round -eq 1 ]; then
      harness_maybe_pause_sprint "$CURRENT" "$TOTAL"
    fi

    # ─── Generator ───────────────────────────────────────────────
    echo ""
    echo "▶ GENERATOR (Sprint $CURRENT, Round $qa_round)"
    echo ""

    harness_maybe_pause_phase "generator" "$CURRENT" "$qa_round"

    QA_CONTEXT=""
    MECH_CONTEXT=""
    if [ -f "docs/qa-report-sprint-${CURRENT}.md" ]; then
      QA_CONTEXT="

IMPORTANT: The evaluator found issues in the last round. Read docs/qa-report-sprint-${CURRENT}.md and fix ALL failures before proceeding to new features."
    fi
    if [ -f "docs/mechanical-checks-sprint-${CURRENT}.md" ] && grep -qi "Result:.*FAIL" "docs/mechanical-checks-sprint-${CURRENT}.md" 2>/dev/null; then
      MECH_CONTEXT="

IMPORTANT: Pre-QA mechanical checks failed. Read docs/mechanical-checks-sprint-${CURRENT}.md and fix ALL listed issues."
    fi

    claude --dangerously-skip-permissions \
      "${claude_model_args[@]}" \
      -p "$(cat agents/generator.md)

$GUARDRAIL_CONTEXT
$GENERATOR_LINT_CONTEXT
Read docs/spec.md for the full spec.
Read docs/sprint-plan.md for the sprint breakdown.
Read docs/sprint-status.md to find the current sprint.
Read all criteria files in agents/criteria/.
Read CLAUDE.md for the design language and stack.
Check git log for what's already built.
$QA_CONTEXT
$MECH_CONTEXT

You are building Sprint $CURRENT. Write the sprint contract to docs/sprint-${CURRENT}-contract.md if it doesn't exist, then implement it. Commit to git after each meaningful unit of work.

After building, write your self-evaluation to the end of docs/sprint-${CURRENT}-contract.md and update docs/sprint-status.md to 'Ready for QA'.
$HARNESS_AUTONOMOUS_SUFFIX"

    echo ""
    echo "✓ Generator completed Sprint $CURRENT, Round $qa_round"

    # ─── Pre-QA Gate ─────────────────────────────────────────────
    echo ""
    echo "▶ PRE-QA GATE (Sprint $CURRENT)"
    if ! run_pre_qa_gate "$CURRENT"; then
      echo "  → Mechanical checks failed — sending back to Generator..."
      continue
    fi

    write_handoff generator "$CURRENT" "$qa_round" run-evaluator \
      "docs/sprint-${CURRENT}-contract.md,docs/sprint-status.md,docs/mechanical-checks-sprint-${CURRENT}.md"

    # ─── Evaluator ───────────────────────────────────────────────
    echo ""
    echo "▶ EVALUATOR (Sprint $CURRENT, Round $qa_round)"
    echo ""

    harness_maybe_pause_phase "evaluator" "$CURRENT" "$qa_round"

    claude --dangerously-skip-permissions \
      "${claude_model_args[@]}" \
      -p "$(cat agents/evaluator.md)

$GUARDRAIL_CONTEXT
Read docs/spec.md for the product context and design language.
Read docs/sprint-${CURRENT}-contract.md for the acceptance criteria.
Read docs/mechanical-checks-sprint-${CURRENT}.md for automated check results.
Read review-personas/security.md and review-personas/frontend-architecture.md for code review checklists.
Read all criteria files in agents/criteria/.
Read the Generator's self-evaluation at the bottom of the contract.

Start the application and test it thoroughly using Playwright.
Grade using the weighted scoring formula in your instructions.
Include a 'Mechanical Checks' section in your QA report.
Write your full report to docs/qa-report-sprint-${CURRENT}.md.
Update docs/sprint-status.md with the result.

Be skeptical. Find problems. Do not praise mediocre work."

    validate_phase evaluator "$CURRENT"

    echo ""
    echo "✓ Evaluator completed Sprint $CURRENT, Round $qa_round"

    # ─── Check result ────────────────────────────────────────────
    if sprint_passed "$CURRENT"; then
      echo ""
      echo "✅ Sprint $CURRENT PASSED on round $qa_round"
      harness_track_sprint_finished
      break
    else
      echo ""
      echo "❌ Sprint $CURRENT FAILED on round $qa_round"
      log_qa_failure "$CURRENT" "$qa_round"
      if [ $qa_round -lt $MAX_QA_ROUNDS ]; then
        echo "  → Sending back to Generator for fixes..."
      else
        echo "  → Max QA rounds reached for Sprint $CURRENT."
        echo "  → Review docs/qa-report-sprint-${CURRENT}.md for remaining issues."
        handle_max_rounds "$CURRENT"
        harness_track_sprint_finished
        break
      fi
    fi
  done
done

# ─── Summary ─────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  HARNESS COMPLETE"
echo "  Spec:         docs/spec.md"
echo "  Sprint plan:  docs/sprint-plan.md"
echo "  Status:       docs/sprint-status.md"
echo "============================================"
echo ""
echo "QA reports:"
for report in docs/qa-report-sprint-*.md; do
  [ -f "$report" ] && echo "  $report"
done
