# Runtime Contract

This document defines the shared file and state contract used by the **Claude Code
harness** (orchestration + guardrails):

- `./harness.sh` autonomous execution — **canonical**
- Claude Code interactive execution (`.claude/commands/*` → `.claude/agents/*` subagents)

Sibling repos for other tools (separate products, not adapters in this tree):

- [tri-agent-harness-cursor](https://github.com/stjarnstrom/tri-agent-harness-cursor) — Cursor CLI
- [tri-agent-harness-opencode](https://github.com/stjarnstrom/tri-agent-harness-opencode) — OpenCode CLI

The interactive Claude Code path dispatches each phase to a dedicated subagent
(`planner`, `generator`, `evaluator`, `retrospector`) via the `/plan`,
`/build`, `/qa`, and `/retro` slash commands. Each subagent runs in its own isolated context and communicates
only through the canonical files below — the same isolation `harness.sh` gets
from separate `claude -p` processes. Subagents cannot pause mid-run, so
`/build` writes the sprint contract and implements in a single pass.

On the Claude Code paths, each phase runs on a model matched to its job:
Planner and Evaluator on `claude-fable-5` (big-picture reasoning and code
review), Generator on `claude-sonnet-5` (implementation), Retrospector on
`claude-fable-5` (generalizing failures into lessons). Interactive/mobile
runs read this from the `model:` field in `.claude/agents/*`; `harness.sh` reads
it from per-phase defaults, overridable via `HARNESS_PLANNER_MODEL` /
`HARNESS_GENERATOR_MODEL` / `HARNESS_EVALUATOR_MODEL` / `HARNESS_RETRO_MODEL`,
or `HARNESS_MODEL` for all phases. `HARNESS_RETRO=off` disables the
Retrospector phase on `./harness.sh`.

If both autonomous and interactive modes follow this contract, you can switch
between them at any time within the same repo.

Autonomous runs write `docs/workflow-handoff.json` at phase boundaries
via `harness-runtime/cli.mjs`.

## Architecture Layers

1. **Environment (always on):** `harness/AGENT-INSTRUCTIONS.md`, git hooks,
   ESLint plugin, sandbox settings. Every agent invocation follows these rules.
2. **Orchestration:** Planner → Generator → **Pre-QA Gate** → Evaluator loop,
   then **Retrospector** at end of run.
3. **Phase gates (programmatic):** `scripts/pre-qa-gate.sh` runs mechanical
   checks before Evaluator. Failures return to Generator without consuming a QA round.

## Canonical Files

### Core planning artifacts
- `docs/spec.md`: product vision, features, design language, AI integration.
- `docs/sprint-plan.md`: sprint sequence and per-sprint "done when" outcomes.
- `docs/sprint-status.md`: source of truth for sprint state.
- `docs/design-options.md`: three proposed design directions (design-scout mode only).

### Design input (optional, user-provided before planning)
- `design/brief.md`: primary design direction (authoritative).
- `design/constraints.md`: must-have / must-not rules.
- `design/selected-direction.md`: user's pick after reviewing `docs/design-options.md`.
- `design/references/*`: mood images, logos, screenshots (png, jpg, webp, svg).
- `brand-guidelines.md` (root or `agents/`): legacy alias for brief content.

### Sprint artifacts
- `docs/sprint-[N]-contract.md`: sprint scope, acceptance criteria, self-eval.
- `docs/mechanical-checks-sprint-[N].md`: pre-QA gate results (written by orchestrator).
- `docs/qa-report-sprint-[N].md`: evaluator QA results and recommendations.

### Guardrail artifacts
- `harness/AGENT-INSTRUCTIONS.md`: universal agent rules (sandbox, lints, anti-slop).
- `review-personas/*.md`: security, frontend, reliability review checklists.
- `.gc-cache/weekly-report.jsonl`: QA failure log for anti-slop loop (gitignored).

### Learning artifacts (owned by the Retrospector)
- `harness/lessons.jsonl`: cross-run lessons ledger (source of truth; append/update entries, never hand-edit LESSONS.md).
- `harness/LESSONS.md`: rendered from the ledger by `scripts/render-lessons.mjs`; required reading for Planner, Generator, and Evaluator.
- `docs/proposals/guardrail-[id].md`: draft guardrails for lessons at 2+ strikes; humans review, commit, then mark the ledger entry `graduated`.
- `docs/qa-report-sprint-[N].md` gains a required `LESSON-CANDIDATES` block (written by the Evaluator, consumed by the Retrospector).

### Shared context
- `CLAUDE.md`: project-level context, stack defaults, design defaults, and links.
- `agents/*.md`: planner/generator/evaluator/retrospector role instructions.
- `agents/criteria/*.md`: QA scoring and quality rubrics.

## Ownership And Read/Write Rules

### Planner phase
- Reads: `CLAUDE.md`, `harness/AGENT-INSTRUCTIONS.md`, `agents/planner.md`,
  `agents/criteria/*.md`, `harness/workspace-template.md`, `design/*` (if present),
  `docs/design-options.md` (finalize mode), `docs/templates/design-options.md` (scout mode)
- Writes (full/finalize mode):
  - `docs/spec.md`
  - `docs/sprint-plan.md`
  - `docs/sprint-status.md` (initialize all sprints as `Not started`)
  - `CLAUDE.md` (project-specific updates)
- Writes (design-scout mode — no user brief):
  - `docs/design-options.md` only — harness halts for user selection

### Planning state (resume logic)

| State | Files present | Next action |
|-------|---------------|-------------|
| Complete | `docs/spec.md` + `docs/sprint-status.md` | Resume build loop |
| Await selection | `docs/design-options.md`, no `docs/sprint-status.md`, no `design/selected-direction.md` | User picks direction; re-run harness |
| Finalize | `docs/design-options.md` + `design/selected-direction.md`, no sprint status | Run planner (finalize mode) |
| Initial + brief | `design/brief.md` or references | Run planner (full mode) |
| Initial, no brief | — | Run planner (scout mode) unless `HARNESS_YES=1` (full mode, autonomous pick) |

### Generator phase
- Reads:
  - `docs/spec.md`
  - `docs/sprint-plan.md`
  - `docs/sprint-status.md`
  - `CLAUDE.md`
  - `harness/AGENT-INSTRUCTIONS.md`
  - `agents/generator.md`
  - `agents/criteria/*.md`
  - previous `docs/qa-report-sprint-[N].md` if present
  - previous `docs/mechanical-checks-sprint-[N].md` if gate failed
- Writes:
  - `docs/sprint-[N]-contract.md` (create/update)
  - `docs/sprint-status.md` (set target sprint to `Ready for QA`)
  - application code under `app/` and related assets (must pass pre-commit hook)

### Pre-QA Gate (orchestrator, not an agent)
- Reads: sprint contract, sprint status, application source
- Writes: `docs/mechanical-checks-sprint-[N].md`
- Blocks Evaluator if Result: FAIL

### Evaluator phase
- Reads:
  - `docs/spec.md`
  - `design/brief.md` (if present — compare implementation to user brief)
  - `docs/sprint-status.md`
  - `docs/sprint-[N]-contract.md`
  - `docs/mechanical-checks-sprint-[N].md`
  - `harness/AGENT-INSTRUCTIONS.md`
  - `agents/evaluator.md`
  - `agents/criteria/*.md`
  - `review-personas/*.md`
- Writes:
  - `docs/qa-report-sprint-[N].md` (including the `LESSON-CANDIDATES` block)
  - `docs/sprint-status.md` (set QA result for target sprint)

### Retrospector phase (end of run, best-effort)
- Reads:
  - `docs/qa-report-sprint-*.md` (all — the `LESSON-CANDIDATES` blocks)
  - `docs/sprint-*-contract.md`
  - `harness/lessons.jsonl`
  - `agents/retrospector.md`, `harness/AGENT-INSTRUCTIONS.md`
- Writes:
  - `harness/lessons.jsonl` (update entries; never delete lines — retire instead)
  - `harness/LESSONS.md` (via `node scripts/render-lessons.mjs` only)
  - `docs/proposals/guardrail-[id].md` (for active lessons at 2+ strikes)
- Never modifies: application code, agent personas, lint rules, review personas.
- Failure is non-fatal: the harness run's result stands regardless.

## Sprint State Machine (`docs/sprint-status.md`)

Expected status progression per sprint:

1. `Not started`
2. `In progress` (optional intermediate)
3. `Ready for QA`
4. `Pass`, `Fail`, or `Skipped` (terminal — `Skipped` when max QA rounds reached with `HARNESS_ON_MAX_ROUNDS=advance`)

Rules:
- A sprint can only be evaluated when status is `Ready for QA` **and** pre-QA gate passes.
- A `Fail` sprint can return to `In progress`/`Ready for QA` for rework cycles.
- Harness resumes from the first sprint not in terminal `Pass` or `Skipped` state.
- On max QA rounds: **halt by default**. Set `HARNESS_ON_MAX_ROUNDS=advance` to mark the sprint `Skipped` and continue to the next sprint with known issues.

## Mode Switching Rules

Within this repo, prefer `./harness.sh` for autonomous runs and slash commands
for interactive control. Both paths share the same canonical files above.

## Conflict Resolution

If mode outputs disagree, trust these in order:

1. `docs/sprint-status.md` for current state
2. latest `docs/qa-report-sprint-[N].md` for QA truth
3. latest `docs/sprint-[N]-contract.md` for sprint acceptance criteria
4. `docs/spec.md` for product intent

When in doubt, run a focused evaluator pass and update status/report first.
