---
name: harness-cycle
description: Run the full tri-agent build cycle (Planner → Generator → Pre-QA Gate → Evaluator → Retrospector) from a single Claude Code conversation, dispatching each phase to an isolated subagent. Use when the user wants to build a product with the harness without running ./harness.sh in a terminal — "run the harness", "build this with the harness", "run the cycle", "continue the build", "next sprint" — or invokes /harness-cycle. For a single phase, use /plan, /build, /qa, or /retro instead.
argument-hint: "[product prompt] [sprints=N] [rounds=N] [advance] [pause=sprint] [retro=off]"
---

# Harness cycle (chat-driven)

You are the **orchestrator**. `./harness.sh` does this job in bash; here you do it
in one conversation, and every phase still runs in its own isolated subagent.

Your job is to execute steps, not to decide them. `next-step` decides.

## Absolute rules

1. **Never build, test, or grade anything yourself.** No writing app code, no
   running Playwright, no judging quality. Those belong to the `generator` and
   `evaluator` subagents. If you implement in this thread, the Evaluator's
   independence is gone and the cycle is worthless.
2. **Never decide the next phase from your own reading of the docs.** Always run
   `next-step` and do exactly what it says. It owns round counting, the pre-QA
   gate ordering, and the round budget.
3. **Never skip the pre-QA gate.** Mechanical checks run before the Evaluator,
   every round.
4. **Record every phase you complete**, immediately, before running `next-step`
   again. That is how the round budget stays honest.
5. **Keep your own context thin.** Read status files and short reports; never
   read app source to "check" a subagent's work. The files on disk are the
   handoff.

## The loop

Run this until the step is a stopping step:

```bash
node harness-runtime/cli.mjs next-step
```

It prints `Step`, `Sprint`, `Round`, `Subagent`, `Focus`, `Command`, `Reason`,
`Instruction`, and `Context files`. Act on the step:

| Step | What you do |
|---|---|
| `run-planner` | Dispatch the `planner` subagent (see below), then record `planner`. |
| `run-generator` | Dispatch the `generator` subagent, then record `generator`. |
| `run-pre-qa-gate` | Run the printed `Command` with Bash, then record `pre-qa-gate` with `--result pass\|fail`. Never dispatch the evaluator instead. |
| `run-evaluator` | Dispatch the `evaluator` subagent, then record `evaluator`. |
| `run-retro` | Dispatch the `retrospector` subagent, then record `retrospector`. |
| `advance-sprint` | Run the printed `Command`, tell the user what stays broken, continue. |
| `await-design-selection` | Stop. Ask the user to pick a direction from `docs/design-options.md`. |
| `halt` | Stop. Report the blocking issues and offer the choices in the instruction. |
| `manual-review` | Stop. Report the inconsistent sprint row for a human to fix. |
| `done` | Stop. Report final statuses and QA results. |

After every phase, record it, then loop:

```bash
node harness-runtime/cli.mjs next-step --record generator --sprint 3
node harness-runtime/cli.mjs next-step --record pre-qa-gate --sprint 3 --result fail
node harness-runtime/cli.mjs next-step --record evaluator --sprint 3
node harness-runtime/cli.mjs next-step --record retrospector
```

Pass the `--sprint` value that `next-step` printed. Do not compute round
numbers yourself — you never need to.

## Dispatching a phase

Use the Agent tool with `subagent_type` matching the `Subagent` field
(`planner`, `generator`, `evaluator`, `retrospector`). Each subagent already
knows its own persona and required reading; your prompt gives it the target and
the focus, not a re-explanation of its job.

Dispatch with the Agent tool directly — do **not** invoke the `/plan`, `/build`,
`/qa`, or `/retro` skills to do it. Those are the manual single-phase entry
points; they fork with a fixed prompt and cannot carry the sprint number, round,
focus, and context files that `next-step` just told you to pass.

Include in the prompt:

- The `Instruction` line from `next-step`, verbatim.
- The sprint number and, for the generator, the round and `Focus`:
  - `build` — implement the sprint (write the contract first if missing).
  - `fix-qa-failures` — fix every failure in the QA report **before** new work.
  - `fix-mechanical-checks` — fix every item in the mechanical-checks report.
- The `Context files` list, as the files to read.
- Any extra context the user gave you for this run.

Dispatch **one** subagent at a time and wait for it. Phases are strictly
sequential — the next phase reads files the previous one writes.

When a subagent returns, relay a two-to-four line summary to the user (what it
did, verdict/score if any, notable gaps) before continuing. The user is watching
a long run; keep them oriented without dumping the full report.

## Setup (first invocation in a fresh clone)

If `.git/hooks/pre-commit` is missing, run `bun install && bun run setup` first —
the guardrails (sandbox, lints, secret scan) are enforced at commit time and the
Generator's commits depend on them.

If the user's prompt names a product and `docs/spec.md` does not exist yet, pass
that prompt to the `planner` subagent as the product prompt.

## Autonomy and budget

Defaults come from `harness-runtime.config.json` (`maxQaRounds`,
`onMaxRoundsReached`). Honor these arguments when the user gives them:

- **`sprints=N`** — stop after N sprints reach a terminal state and report where
  the cycle stands. Default: run until `done`.
- **`rounds=N`** — override the QA-round budget per sprint. Export
  `HARNESS_MAX_QA_ROUNDS=N` for the `next-step` calls so the budget is enforced
  by the tool, not by you.
- **`advance`** — on an exhausted budget, advance with known issues instead of
  halting: export `HARNESS_ON_MAX_ROUNDS=advance`.
- **`pause=sprint`** — confirm with the user before starting each new sprint.
- **`retro=off`** — skip the `run-retro` step and go straight to reporting.

Unless the user asked to pause, do not stop between phases to ask permission —
run the cycle. Stop only on a stopping step, a genuine ambiguity, or a repeated
tool failure.

## When something breaks

- **A subagent fails or returns nothing useful:** run `next-step` again. It reads
  canonical state from disk, so it will re-issue the same step. Retry once; if it
  fails the same way, stop and report to the user.
- **The gate fails repeatedly on the same item:** that is a real defect, not a
  flake. It is already consuming rounds; let the budget do its job and report the
  pattern when you stop.
- **`next-step` reports `manual-review`:** the sprint-status table is
  inconsistent. Do not "fix" it by guessing a status — report it.

## Finishing

When you reach `done` (or the sprint/round limit), report:

- Sprints completed, with pass/fail/skipped status.
- Where the QA reports and lessons live (`docs/qa-report-sprint-*.md`,
  `harness/LESSONS.md`).
- Anything left broken or skipped, stated plainly.
- Any guardrail proposals the Retrospector drafted in `docs/proposals/`.
