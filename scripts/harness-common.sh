# harness-common.sh — Shared sprint helpers for harness runners
#
# Sourced by harness.sh and cursor-harness.sh. Do not execute directly.

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Default: halt on max QA rounds (aligns with guardrail philosophy).
# Set HARNESS_ON_MAX_ROUNDS=advance to allow advancing with known failures.
HARNESS_ON_MAX_ROUNDS="${HARNESS_ON_MAX_ROUNDS:-halt}"

# Pause controls (token/cost management)
# HARNESS_PAUSE: off (default) | sprint | phase
#   sprint — confirm before each new sprint (qa round 1 only)
#   phase  — confirm before every Planner/Generator/Evaluator invocation
# HARNESS_YES=1 — skip all pause prompts (fully autonomous)
# HARNESS_MAX_SPRINTS_PER_RUN=N — stop after N sprints in this invocation (resume later)
# HARNESS_USAGE_CHECK=1 — run scripts/usage-check.sh at sprint boundaries
# HARNESS_USAGE_CMD='...' — custom command; exit 1 when budget is low
HARNESS_PAUSE="${HARNESS_PAUSE:-off}"
HARNESS_YES="${HARNESS_YES:-0}"
HARNESS_USAGE_CHECK="${HARNESS_USAGE_CHECK:-0}"
HARNESS_MAX_SPRINTS_PER_RUN="${HARNESS_MAX_SPRINTS_PER_RUN:-}"
SPRINTS_COMPLETED_THIS_RUN=0

# ─── Pause / budget helpers ────────────────────────────────────────────

harness_should_pause_sprint() {
  [[ "$HARNESS_PAUSE" == "sprint" || "$HARNESS_PAUSE" == "phase" ]]
}

harness_should_pause_phase() {
  [[ "$HARNESS_PAUSE" == "phase" ]]
}

harness_prompt_continue() {
  local label="$1"
  local next_sprint="${2:-}"

  if [ "$HARNESS_YES" = "1" ]; then
    return 0
  fi

  echo ""
  echo "⏸  Checkpoint: $label"
  if [ -n "$next_sprint" ] && [ "$next_sprint" != "done" ]; then
    echo "   Next: Sprint $next_sprint"
  fi
  echo "   State saved in docs/sprint-status.md — resume with the same harness command."
  echo ""
  read -r -p "Continue? [y/N/a=all remaining sprints] " answer </dev/tty || answer=""
  case "$answer" in
    y|Y|yes|Yes)
      return 0
      ;;
    a|A|all)
      HARNESS_YES=1
      export HARNESS_YES
      echo "  → Continuing without further prompts this run."
      return 0
      ;;
    *)
      echo ""
      echo "Paused. Re-run ./harness.sh or ./cursor-harness.sh with the same prompt to resume."
      exit 0
      ;;
  esac
}

harness_check_usage() {
  local label="$1"

  if [ "$HARNESS_USAGE_CHECK" != "1" ]; then
    return 0
  fi

  echo ""
  echo "▶ Usage check ($label)..."
  if bash "$PROJECT_DIR/scripts/usage-check.sh"; then
    return 0
  fi

  echo ""
  echo "⚠ Usage check reported low budget."
  if [ "$HARNESS_YES" = "1" ]; then
    echo "  HARNESS_YES=1 set — continuing anyway."
    return 0
  fi

  harness_prompt_continue "usage warning — $label"
}

harness_maybe_pause_sprint() {
  local sprint="$1"
  local total="$2"

  harness_check_usage "before sprint $sprint/$total"

  if harness_should_pause_sprint; then
    harness_prompt_continue "before Sprint $sprint / $total" "$sprint"
  fi
}

harness_maybe_pause_phase() {
  local phase="$1"
  local sprint="${2:-}"
  local round="${3:-}"

  if ! harness_should_pause_phase; then
    return 0
  fi

  local label="$phase"
  if [ -n "$sprint" ]; then
    label="$phase (Sprint $sprint"
    if [ -n "$round" ]; then
      label="$label, Round $round"
    fi
    label="$label)"
  fi

  harness_prompt_continue "$label" "$sprint"
}

harness_track_sprint_finished() {
  SPRINTS_COMPLETED_THIS_RUN=$((SPRINTS_COMPLETED_THIS_RUN + 1))

  if [ -z "$HARNESS_MAX_SPRINTS_PER_RUN" ]; then
    return 0
  fi

  if [ "$SPRINTS_COMPLETED_THIS_RUN" -ge "$HARNESS_MAX_SPRINTS_PER_RUN" ]; then
    echo ""
    echo "⏸ Reached HARNESS_MAX_SPRINTS_PER_RUN=$HARNESS_MAX_SPRINTS_PER_RUN for this invocation."
    echo "   Completed $SPRINTS_COMPLETED_THIS_RUN sprint(s) this run."
    echo "   Re-run with the same prompt to continue."
    exit 0
  fi
}

harness_print_pause_config() {
  if [ "$HARNESS_PAUSE" != "off" ] || [ -n "$HARNESS_MAX_SPRINTS_PER_RUN" ] || [ "$HARNESS_USAGE_CHECK" = "1" ]; then
    echo "  Pause mode: $HARNESS_PAUSE"
    if [ -n "$HARNESS_MAX_SPRINTS_PER_RUN" ]; then
      echo "  Max sprints this run: $HARNESS_MAX_SPRINTS_PER_RUN"
    fi
    if [ "$HARNESS_USAGE_CHECK" = "1" ]; then
      echo "  Usage check: enabled"
    fi
    if [ "$HARNESS_YES" = "1" ]; then
      echo "  Auto-continue: yes (HARNESS_YES=1)"
    fi
  fi
}

# ─── Helper: get current sprint number from sprint-status.md ─────────
get_current_sprint() {
  if [ ! -f docs/sprint-status.md ]; then
    echo "0"
    return
  fi
  local sprint
  sprint=$(grep -E "^\|\s*[0-9]+" docs/sprint-status.md | while IFS='|' read -r _ num _ status _; do
    num=$(echo "$num" | xargs)
    status=$(echo "$status" | xargs)
    if [[ "$status" == "Pass" || "$status" == "Skipped" ]]; then
      continue
    fi
    if [[ "$status" == "Not started" || "$status" == "In progress" || "$status" == "Ready for QA" || "$status" == "Fail" ]]; then
      echo "$num"
      break
    fi
  done)
  echo "${sprint:-done}"
}

# ─── Helper: get total sprint count ──────────────────────────────────
get_total_sprints() {
  if [ ! -f docs/sprint-status.md ]; then
    echo "0"
    return
  fi
  grep -cE "^\|\s*[0-9]+" docs/sprint-status.md || echo "0"
}

# ─── Helper: check if sprint passed ─────────────────────────────────
sprint_passed() {
  local sprint_num="$1"
  local report="docs/qa-report-sprint-${sprint_num}.md"
  if [ -f "$report" ] && grep -qi "Result:.*PASS" "$report" 2>/dev/null; then
    return 0
  fi
  return 1
}

# ─── Helper: run pre-QA mechanical gate ───────────────────────────────
run_pre_qa_gate() {
  local sprint="$1"
  bash "$PROJECT_DIR/scripts/pre-qa-gate.sh" "$sprint"
}

# ─── Helper: validate phase via sdk-orchestrator ─────────────────────
validate_phase() {
  local phase="$1"
  local sprint="${2:-1}"
  if [ -f "$PROJECT_DIR/sdk-orchestrator/cli.mjs" ] && command -v node >/dev/null 2>&1; then
    node "$PROJECT_DIR/sdk-orchestrator/cli.mjs" validate --phase "$phase" --sprint "$sprint"
  fi
}

# ─── Helper: write workflow handoff manifest ─────────────────────────
write_handoff() {
  local phase="$1"
  local sprint="$2"
  local qa_round="$3"
  local next="$4"
  shift 4
  local artifacts="$*"

  if [ -f "$PROJECT_DIR/sdk-orchestrator/cli.mjs" ] && command -v node >/dev/null 2>&1; then
    node "$PROJECT_DIR/sdk-orchestrator/cli.mjs" handoff-write \
      --phase "$phase" \
      --sprint "$sprint" \
      --qa-round "$qa_round" \
      --next "$next" \
      --source "${HARNESS_SOURCE:-harness.sh}" \
      --artifacts "$artifacts"
  fi
}

# ─── Helper: log repeat QA failure to anti-slop cache ─────────────────
log_qa_failure() {
  local sprint="$1"
  local qa_round="$2"
  local cache_dir=".gc-cache"
  local cache_file="$cache_dir/weekly-report.jsonl"
  mkdir -p "$cache_dir"

  printf '{"ts":"%s","category":"qa-failure","sprint":%s,"round":%s,"description":"Sprint %s failed QA round %s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "$sprint" \
    "$qa_round" \
    "$sprint" \
    "$qa_round" \
    >> "$cache_file"
}

# ─── Helper: mark sprint skipped after max QA rounds (advance policy) ───
mark_sprint_skipped() {
  local sprint="$1"
  local notes="${2:-Max QA rounds reached; advanced with known issues}"

  if [ -f "$PROJECT_DIR/sdk-orchestrator/cli.mjs" ] && command -v node >/dev/null 2>&1; then
    node "$PROJECT_DIR/sdk-orchestrator/cli.mjs" sprint-mark-skipped \
      --sprint "$sprint" \
      --notes "$notes"
    return 0
  fi

  echo "ERROR: Node.js is required to mark sprint $sprint as Skipped (sdk-orchestrator/cli.mjs)."
  return 1
}

# ─── Agent watchdog (cursor-harness) ─────────────────────────────────
# cursor agent often finishes writing artifacts but keeps MCP/dev child
# processes alive. Poll for canonical phase outputs and stop the agent
# process group when they are stable.
#
# HARNESS_AGENT_WATCHDOG=0     disable (wait for cursor agent to exit on its own)
# HARNESS_AGENT_POLL_SEC=15    seconds between artifact checks
# HARNESS_AGENT_STABLE_POLLS=2 consecutive ready polls before stopping agent
# HARNESS_PHASE_TIMEOUT=7200   wall-clock seconds per agent run (0 = no limit)

harness_get_sprint_row_status() {
  local sprint_num="$1"
  awk -F'|' -v s="$sprint_num" '
    /^\|[[:space:]]*[0-9]+/ {
      num=$2; st=$4
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", num)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", st)
      if (num == s) { print st; exit }
    }
  ' docs/sprint-status.md 2>/dev/null
}

harness_phase_artifacts_ready() {
  local phase="$1"
  local sprint="${2:-1}"
  local row_status=""

  case "$phase" in
    planner)
      [[ -f docs/spec.md && -f docs/sprint-plan.md && -f docs/sprint-status.md ]]
      ;;
    generator)
      [[ -f "docs/sprint-${sprint}-contract.md" && -f docs/sprint-status.md ]] || return 1
      row_status="$(harness_get_sprint_row_status "$sprint")"
      [[ "$row_status" == "Ready for QA" ]]
      ;;
    evaluator)
      [[ -f "docs/qa-report-sprint-${sprint}.md" && -f docs/sprint-status.md ]] || return 1
      grep -qiE 'Result:[[:space:]]*(PASS|FAIL)' "docs/qa-report-sprint-${sprint}.md" || return 1
      row_status="$(harness_get_sprint_row_status "$sprint")"
      [[ "$row_status" == "Pass" || "$row_status" == "Fail" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

harness_stop_agent_process_group() {
  local agent_pid="$1"
  local agent_pgid="$2"
  local reason="$3"

  echo ""
  echo "▶ Agent watchdog: $reason"

  if [ -n "$agent_pgid" ]; then
    kill -TERM "-$agent_pgid" 2>/dev/null || kill -TERM "$agent_pid" 2>/dev/null || true
  else
    kill -TERM "$agent_pid" 2>/dev/null || true
  fi

  local grace=0
  while kill -0 "$agent_pid" 2>/dev/null && [ "$grace" -lt 30 ]; do
    sleep 1
    grace=$((grace + 1))
  done

  if kill -0 "$agent_pid" 2>/dev/null; then
    echo "  → Force-stopping hung agent (PID $agent_pid)..."
    if [ -n "$agent_pgid" ]; then
      kill -KILL "-$agent_pgid" 2>/dev/null || kill -KILL "$agent_pid" 2>/dev/null || true
    else
      kill -KILL "$agent_pid" 2>/dev/null || true
    fi
  fi
}

run_cursor_agent() {
  local phase="${1:?phase required (planner|generator|evaluator)}"
  local sprint="${2:?sprint required}"
  local phase_prompt="${3:?prompt required}"

  local cursor_args=(
    agent -p --force --approve-mcps
    --workspace "$PROJECT_DIR"
  )
  if [ -n "${HARNESS_MODEL:-}" ]; then
    cursor_args+=(--model "$HARNESS_MODEL")
  fi
  cursor_args+=("$phase_prompt")

  if [ "${HARNESS_AGENT_WATCHDOG:-1}" = "0" ]; then
    cursor "${cursor_args[@]}"
    return $?
  fi

  local poll_sec="${HARNESS_AGENT_POLL_SEC:-15}"
  local stable_needed="${HARNESS_AGENT_STABLE_POLLS:-2}"
  local timeout_sec="${HARNESS_PHASE_TIMEOUT:-7200}"
  local started_at=$SECONDS
  local stable_count=0
  local agent_pid=""
  local agent_pgid=""
  local job_control_was_on=0

  case "$-" in
    *m*) job_control_was_on=1 ;;
  esac

  set -m
  cursor "${cursor_args[@]}" &
  agent_pid=$!
  agent_pgid="$(ps -o pgid= -p "$agent_pid" 2>/dev/null | tr -d ' ')"

  while kill -0 "$agent_pid" 2>/dev/null; do
    if harness_phase_artifacts_ready "$phase" "$sprint"; then
      stable_count=$((stable_count + 1))
      if [ "$stable_count" -ge "$stable_needed" ]; then
        harness_stop_agent_process_group "$agent_pid" "$agent_pgid" \
          "phase artifacts complete (${phase}, sprint ${sprint})"
        break
      fi
    else
      stable_count=0
    fi

    if [ "$timeout_sec" -gt 0 ] && [ $((SECONDS - started_at)) -ge "$timeout_sec" ]; then
      harness_stop_agent_process_group "$agent_pid" "$agent_pgid" \
        "wall-clock timeout (${timeout_sec}s)"
      break
    fi

    sleep "$poll_sec"
  done

  local exit_code=0
  wait "$agent_pid" 2>/dev/null || exit_code=$?

  if [ "$job_control_was_on" -eq 0 ]; then
    set +m
  fi

  if harness_phase_artifacts_ready "$phase" "$sprint"; then
    echo "✓ Phase artifacts verified (${phase}, sprint ${sprint})"
    return 0
  fi

  return "$exit_code"
}

# ─── Helper: handle max QA rounds reached ────────────────────────────
# Returns 0 to break inner loop (advance), 1 to halt harness
handle_max_rounds() {
  local sprint="$1"
  log_qa_failure "$sprint" "$MAX_QA_ROUNDS"

  if [ "$HARNESS_ON_MAX_ROUNDS" = "advance" ]; then
    if ! mark_sprint_skipped "$sprint"; then
      echo "  → Failed to mark Sprint $sprint as Skipped."
      exit 1
    fi
    echo "  → HARNESS_ON_MAX_ROUNDS=advance: marked Sprint $sprint as Skipped; moving to next sprint."
    return 0
  fi

  echo ""
  echo "⛔ HALTED: Max QA rounds reached for Sprint $sprint."
  echo "  Review docs/qa-report-sprint-${sprint}.md"
  echo "  Fix issues and re-run: ./harness.sh \"<same prompt>\""
  echo "  Or advance anyway: HARNESS_ON_MAX_ROUNDS=advance ./harness.sh \"<prompt>\""
  exit 1
}

# ─── Shared agent context blocks ─────────────────────────────────────
GUARDRAIL_CONTEXT="
Read harness/AGENT-INSTRUCTIONS.md before acting. Follow sandbox, lint, and commit rules."

GENERATOR_LINT_CONTEXT="
Before marking Ready for QA:
1. Run 'bun lint:harness' (or npm run lint:harness) and fix all issues.
2. If app source exists, ensure package.json has test:unit and test:e2e (see docs/templates/app-package-scripts.md) — do not run test:harness via npm test.
3. Commit with messages that pass the pre-commit hook (bun run setup installs it).
4. Do not stage .env files or hardcode secrets."

EVALUATOR_MECHANICAL_CONTEXT="
Read docs/mechanical-checks-sprint-[N].md for automated lint/artifact results.
Include a 'Mechanical Checks' section in your QA report referencing that file.
Also review against review-personas/security.md and review-personas/frontend-architecture.md checklists where applicable."

HARNESS_AUTONOMOUS_SUFFIX="
AUTONOMOUS MODE: Do not ask for confirmation or pause for human review. After writing the sprint contract, implement it immediately in the same session. Complete all required artifacts and status updates before finishing."
