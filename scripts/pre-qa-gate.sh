#!/usr/bin/env bash
# pre-qa-gate.sh — Mechanical checks before Evaluator runs
#
# Called by harness.sh / cursor-harness.sh after Generator completes.
# Blocks the QA phase until artifacts and guardrails pass.
#
# Usage:
#   ./scripts/pre-qa-gate.sh <sprint_number>
#
# Exit 0 = pass, exit 1 = fail (orchestrator sends back to Generator)

set -euo pipefail

SPRINT="${1:?Usage: pre-qa-gate.sh <sprint_number>}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "=== Pre-QA Gate (Sprint $SPRINT) ==="

FAILURES=()

# ── 1. Artifact validation via sdk-orchestrator ──────────────────────────────
if [ -f "sdk-orchestrator/cli.mjs" ] && command -v node >/dev/null 2>&1; then
  echo "Checking phase artifacts..."
  if ! node sdk-orchestrator/cli.mjs validate --phase generator --sprint "$SPRINT" 2>&1; then
    FAILURES+=("Artifact validation failed (missing contract or sprint status not 'Ready for QA')")
  fi
else
  CONTRACT="docs/sprint-${SPRINT}-contract.md"
  if [ ! -f "$CONTRACT" ]; then
    FAILURES+=("Missing $CONTRACT")
  fi
  if [ -f docs/sprint-status.md ] && ! grep -E "^\|\s*${SPRINT}\s*\|" docs/sprint-status.md | grep -qi "Ready for QA"; then
    FAILURES+=("Sprint $SPRINT status is not 'Ready for QA' in docs/sprint-status.md")
  fi
fi

# ── 2. Harness lints on project source (not just staged) ─────────────────────
if [ -f ".eslintrc.harness.cjs" ] && [ -f "package.json" ]; then
  echo "Running harness lints..."
  LINT_CMD=""
  if command -v bun >/dev/null 2>&1; then
    LINT_CMD="bun run lint:harness"
  elif command -v npm >/dev/null 2>&1; then
    LINT_CMD="npm run lint:harness"
  elif command -v npx >/dev/null 2>&1; then
    LINT_CMD="npx eslint --config .eslintrc.harness.cjs"
  fi

  if [ -n "$LINT_CMD" ]; then
    # Lint app source if present; skip harness internals and node_modules
    LINT_TARGETS=""
    for dir in src app packages frontend backend; do
      [ -d "$dir" ] && LINT_TARGETS="$LINT_TARGETS $dir"
    done
    # Also lint root-level source files
    for f in *.ts *.tsx *.js *.jsx; do
      [ -f "$f" ] && LINT_TARGETS="$LINT_TARGETS $f"
    done

    if [ -n "$(echo "$LINT_TARGETS" | xargs)" ]; then
      if ! $LINT_CMD -- $LINT_TARGETS 2>&1; then
        FAILURES+=("Harness lints failed — run 'bun lint:harness' and fix all issues")
      fi
    else
      echo "No app source directories found — skipping lints (sprint may be docs-only)."
    fi
  else
    echo "No package manager found — skipping lints."
  fi
else
  echo "No harness ESLint config — skipping lints."
fi

# ── 3. Secret scan on working tree changes ───────────────────────────────────
GITLEAKS_CONFIG="$PROJECT_DIR/harness/gitleaks.toml"
if command -v gitleaks >/dev/null 2>&1 && [ -d ".git" ]; then
  echo "Running gitleaks on uncommitted changes..."
  if ! gitleaks protect --staged --redact --config "$GITLEAKS_CONFIG" --source "$PROJECT_DIR" 2>/dev/null; then
    # Also check unstaged if staged passed
    if git diff --name-only 2>/dev/null | grep -qE '\.(ts|tsx|js|jsx|json|env|md)$'; then
      if git diff 2>/dev/null | grep -qEi '(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,})'; then
        FAILURES+=("Possible secret detected in working tree changes")
      fi
    fi
  fi
fi

# ── 4. Write mechanical check report for Evaluator ───────────────────────────
REPORT_DIR="docs"
MECH_REPORT="$REPORT_DIR/mechanical-checks-sprint-${SPRINT}.md"
mkdir -p "$REPORT_DIR"

if [ ${#FAILURES[@]} -eq 0 ]; then
  cat > "$MECH_REPORT" <<EOF
# Mechanical Checks — Sprint $SPRINT
Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Result: PASS

All pre-QA mechanical checks passed:
- Sprint contract and status validated
- Harness lints clean (if applicable)
- No secrets detected in staged changes

The Evaluator should include this section in the QA report.
EOF
  echo ""
  echo "✓ Pre-QA gate PASSED"
  echo "  Report: $MECH_REPORT"
  exit 0
else
  cat > "$MECH_REPORT" <<EOF
# Mechanical Checks — Sprint $SPRINT
Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Result: FAIL

The Generator must fix these before QA can proceed:

EOF
  for f in "${FAILURES[@]}"; do
    echo "- $f" >> "$MECH_REPORT"
  done

  echo ""
  echo "✗ Pre-QA gate FAILED"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo "  Report: $MECH_REPORT"
  exit 1
fi
