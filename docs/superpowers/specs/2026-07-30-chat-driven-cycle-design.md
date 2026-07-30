# Chat-Driven Harness Cycle — Design

**Status:** Implemented
**Date:** 2026-07-30

## Problem

The harness has two runners with a gap between them.

`./harness.sh` runs the whole cycle unattended, but needs a terminal and
`--dangerously-skip-permissions`. The per-phase slash commands (`/plan`,
`/build`, `/qa`, `/retro`) work from any Claude Code surface — including the
desktop and mobile apps — and already dispatch isolated subagents, but **nobody
owns the loop**. Everything in `harness_run_sprint_loop` (scripts/harness-common.sh)
is missing on that path: QA rounds with a maximum, the pre-QA mechanical gate
between Generator and Evaluator, the pass/fail branch, halt-vs-advance policy,
sprint progression, and the end-of-run Retrospector. The human is the loop.

Obra's superpowers repo shows the shape of the fix: the *process itself* is a
skill, the main session orchestrates, and every unit of heavy work goes to a
fresh subagent so the orchestrator's context stays thin.

## Approach

Add a third runner. Do not re-engineer the existing two.

**The orchestrator is a model; the control flow is not.** A model asked to
re-implement a bash `while` loop from prose will eventually skip the gate,
miscount a round, or re-run a finished sprint — the shell version needed an
explicit progress guard (harness-common.sh:1054) for exactly this. So the
decision logic moves into a deterministic CLI command and the skill becomes a
thin executor.

### 1. `next-step` — the oracle

`node harness-runtime/cli.mjs next-step` reads the canonical files and prints
one instruction. It decides:

- **Phase selection** — reuses `getNextDecision()` (planning state, then the
  sprint-status table), so it can never disagree with `./harness.sh`.
- **Gate ordering** — a sprint at `Ready for QA` yields `run-pre-qa-gate`, not
  `run-evaluator`, until a gate report exists.
- **Gate staleness** — a report older than `docs/sprint-status.md` or the sprint
  contract was written before the code it claims to have checked, so a round-1
  PASS cannot wave round-2 output through. This bug is only possible on the chat
  path (the shell loop always runs the gate inline), so it needed a new rule.
- **Round budget** — `cycleAttempts[sprint]` in `docs/orchestrator-state.json`
  counts generator dispatches, cross-checked against `resolveQaRound()`'s
  docs-derived value; the higher wins, so a dropped `--record` call cannot grant
  extra rounds. A gate failure consumes a round, matching the shell loop's
  `continue`.
- **Exhaustion policy** — `halt` or `advance-sprint` per `onMaxRoundsReached`.
- **Retro** — pending when a QA report is newer than `retro.completedAt`, which
  keeps the step idempotent across repeat invocations.

Read path (`next-step`) has no side effects and is safe to call repeatedly.
Write path (`next-step --record <phase>`) does all the arithmetic, so the
orchestrator never computes a round number.

### 2. `harness-cycle` — the skill

`.claude/skills/harness-cycle/SKILL.md`, invoked directly or via `/cycle`. Its
core loop is: run `next-step`, do exactly what it says, record the phase, repeat.
It dispatches the existing `planner` / `generator` / `evaluator` /
`retrospector` subagents — no duplicated personas — and forbids building,
testing, or grading in the orchestrator thread, which is what preserves
Evaluator independence.

Autonomy arguments map onto the shell script's env vars: `sprints=N`
(`HARNESS_MAX_SPRINTS_PER_RUN`), `rounds=N` (`HARNESS_MAX_QA_ROUNDS`), `advance`
(`HARNESS_ON_MAX_ROUNDS`), `pause=sprint` (`HARNESS_PAUSE`), `retro=off`
(`HARNESS_RETRO`).

## What did not need building

- **Subagents and personas** — already existed for the slash commands.
- **Permissions** — `.claude/settings.json` already allows `Bash`, so a full run
  does not stall on prompts.
- **Guardrails** — the pre-commit hook, harness lints, secret scan, and
  read-deny rules are environment-level and apply to every runner unchanged.
- **Per-phase models** — the subagent frontmatter already pins them.
- **The learning loop** — the lessons ledger and two-strike guardrail process are
  file-based and work as-is.

## Files

| File | Change |
|---|---|
| `harness-runtime/next-step.mjs` | New — `computeNextStep()`, `formatNextStep()` |
| `harness-runtime/cycle-state.mjs` | New — gate freshness, attempt counting, retro pending |
| `harness-runtime/cycle-record.mjs` | New — `recordPhase()` bookkeeping |
| `harness-runtime/cli.mjs` | `next-step` command wired in |
| `.claude/skills/harness-cycle/SKILL.md` | New — the orchestrator process |
| `.claude/commands/cycle.md` | New — `/cycle` entry point |
| `tests/next-step.test.mjs` | New — 17 tests |
| `docs/runtime-contract.md` | Three runners; cycle bookkeeping; corrected gate-round rule |

## Note on a corrected doc

`docs/runtime-contract.md` previously said pre-QA gate failures return to the
Generator "without consuming a QA round". The shell loop's `continue` does
consume one, and `harness-common.sh:1139` has a dedicated branch for a sprint
whose rounds were *all* eaten by gate failures. The code was right and the doc
was stale; the doc now matches, and `next-step` implements the same rule.

## Deferred

Superpowers' `subagent-driven-development` splits review into two independent
stages — spec compliance, then code quality. Our Evaluator does both in one
context. If it ever anchors (grading quality leniently because the spec passed),
splitting review personas into a second reviewer subagent is a natural follow-up
that the skill structure already supports. Not needed yet.
