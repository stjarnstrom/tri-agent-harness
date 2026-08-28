# Tri-Agent Harness — Cheat Sheet

One page for team walkthroughs. Full narrative: [README](../README.md). Visual guide: [guide.html](guide.html).

## The insight

**Create ≠ judge.** The Generator builds; the Evaluator grades in a separate context. **Mechanical before subjective** — lints and artifacts pass before Playwright runs.

```
Layer 1  Environment     hooks · ESLint plugin · sandbox · review personas
Layer 2  Orchestration   Planner → Generator ↔ Evaluator → Retrospector
Layer 3  Phase gates     pre-qa-gate.sh (lints, artifacts, secrets)
```

## The loop

```
Prompt → Planner (spec, sprint plan, status)
       → Generator (contract, app/, Ready for QA)
       → Pre-QA Gate (mechanical-checks-sprint-N.md)
       → Evaluator (qa-report-sprint-N.md, Pass/Fail)
       → next sprint  |  retry (round++)
       → Retrospector (end of run → lessons)
```

## Phases at a glance

| Phase | Agent / script | Key output |
|-------|----------------|------------|
| Planner | planner | `docs/spec.md`, `docs/sprint-plan.md`, `docs/sprint-status.md` |
| Generator | generator | `docs/sprint-N-contract.md`, code under `app/` |
| Pre-QA Gate | `scripts/pre-qa-gate.sh` | `docs/mechanical-checks-sprint-N.md` |
| Evaluator | evaluator | `docs/qa-report-sprint-N.md` |
| Retrospector | retrospector | `harness/lessons.jsonl`, `harness/LESSONS.md` |

**Source of truth:** `docs/sprint-status.md` (not chat history, not orchestrator state).

## Decision tree

```
Generator marked Ready for QA?
  └─ pre-qa-gate.sh N
       FAIL → Generator retry (uses a QA round)
       PASS → Evaluator
            FAIL → Generator retry
            PASS → next sprint (or done)
All sprints Pass or Skipped?
  └─ Retrospector (unless HARNESS_RETRO=off)
       new QA report later → retro runs again
```

## Run it

| Mode | Command |
|------|---------|
| Autonomous | `./harness.sh "your product prompt"` |
| One sprint demo | `HARNESS_MAX_SPRINTS_PER_RUN=1 ./harness.sh "…"` |
| Chat loop | `/cycle` then `/cycle` to continue |
| Single phase | `/plan` · `/build` · `/qa` · `/retro` |
| Next step (cycle) | `node harness-runtime/cli.mjs next-step` |

**Setup once:** `git init && bun install && bun run setup`

## Guardrails

| Tool | What it does |
|------|----------------|
| `bun run setup` | Install pre-commit hook (sandbox, lints, secrets) |
| `bun lint:harness` | ESLint rules that read as fix instructions |
| `harness/AGENT-INSTRUCTIONS.md` | Sandbox, lints-as-instructions, anti-slop |
| `review-personas/` | Security, frontend, reliability checklists |
| [Two-strike rule](../CONTRIBUTING.md) | Same mistake twice → automate a guardrail |

## Grading

- **Mechanical FAIL** in gate report → sprint FAIL (Evaluator skipped).
- **Rubrics:** `agents/criteria/*`
- **QA report:** weighted scores + per-criterion Pass/Fail + `LESSON-CANDIDATES`
- **Threshold:** weighted total ≥ 7.0 (see `agents/evaluator.md`)

## Useful dials

| Variable | Default | Use when |
|----------|---------|----------|
| `HARNESS_MAX_SPRINTS_PER_RUN` | unlimited | Cap cost; demo one sprint |
| `HARNESS_PAUSE` | `sprint` on fresh project | Checkpoint before each sprint |
| `HARNESS_YES` | `0` | Skip all pause prompts |
| `HARNESS_ON_MAX_ROUNDS` | `halt` | `advance` skips stuck sprints |
| `HARNESS_RETRO` | `on` | `off` skips Retrospector |
| `HARNESS_PLANNER_MODEL` | `opus` | e.g. `claude-fable-5` for planning |

## Learning loop

```
QA report (LESSON-CANDIDATES) → harness/lessons.jsonl → harness/LESSONS.md
                                      ↓ (2 strikes)
                              docs/proposals/guardrail-*.md
```

## Example walkthrough (no harness run)

Static fictional artifacts: **[docs/examples/](examples/README.md)** — Taskflow habit tracker, Sprint 2 fail → pass.

## Read next

| Topic | Doc |
|-------|-----|
| Full walkthrough | [README](../README.md) |
| File ownership | [runtime-contract.md](runtime-contract.md) |
| Visual field guide | [guide.html](guide.html) |
| Chat-driven cycle | [harness-cycle skill](../.claude/skills/harness-cycle/SKILL.md) |
