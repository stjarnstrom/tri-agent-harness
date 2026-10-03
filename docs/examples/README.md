# Example artifacts (Taskflow)

Static, fictional outputs from a **habit tracker with streak analytics** product ("Taskflow"). Use these to demo the harness **without running** `./harness.sh`.

The story: Sprint 1 (shell + design system) passed. Sprint 2 (log habits + streak display) **failed QA round 1**, was fixed, and **passed round 2**. Sprint 3 is still not started. Before Sprint 2 implementation, one contract review read the contract only. The pre-QA gate also runs a floor guard; in this story that guard passed, and the fail is functional.

## Walk the loop (recommended order)

| # | File | Phase | What to point out |
|---|------|-------|-------------------|
| 1 | [pre-plan-input.md](pre-plan-input.md) | *(before harness)* | Intent brief (not a PRD) → Planner still writes canonical spec. Guide: [planner-input.md](../planner-input.md) |
| 2 | [spec-excerpt.md](spec-excerpt.md) | Planner | Vision, design language, features |
| 3 | [sprint-status-mid-run.md](sprint-status-mid-run.md) | State | Sprint 2 Ready for QA — loop about to gate |
| 4 | [sprint-2-contract.md](sprint-2-contract.md) | Generator | Scope, acceptance tests, stack APIs, self-eval |
| 5 | [sprint-2-contract-review.md](sprint-2-contract-review.md) | Contract review | One pass on the draft, before implementation |
| 6 | [mechanical-checks-sprint-2-pass.md](mechanical-checks-sprint-2-pass.md) | Pre-QA Gate | Mechanical PASS, including the floor guard |
| 7 | [qa-report-sprint-2-fail.md](qa-report-sprint-2-fail.md) | Evaluator | Round 1 FAIL + lesson candidates |
| 8 | [qa-report-sprint-2-pass.md](qa-report-sprint-2-pass.md) | Evaluator | Round 2 PASS after fix |
| 9 | [sprint-status-after-retry.md](sprint-status-after-retry.md) | State | Fail → Pass on same sprint |
| 10 | [lessons-excerpt.md](lessons-excerpt.md) | Retrospector | Distilled rules for future runs |
| 11 | [guardrail-proposal-excerpt.md](guardrail-proposal-excerpt.md) | Learning | Two-strike → proposed lint rule |

## Optional (bookkeeping)

| File | Purpose |
|------|---------|
| [workflow-handoff.json](workflow-handoff.json) | Phase boundary manifest (autonomous / cycle) |
| [orchestrator-state.json](orchestrator-state.json) | Round counting, contract-prep counters, retro bookkeeping |

These are **illustrative** — real runs write live files under `docs/` in your project root.

## Cheat sheet

One-page summary for presentations: [../CHEATSHEET.md](../CHEATSHEET.md).
