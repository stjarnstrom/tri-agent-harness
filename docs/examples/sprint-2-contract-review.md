# Contract review — Sprint 2

> **Example only.** One pass on the Sprint 2 draft, before implementation. The artifact was the contract with the generator self-evaluation removed. The contract file in this folder is the later copy that reached QA, after the Generator classified these findings.

## Findings

- The draft has acceptance criteria and no `## Acceptance tests` section. Nothing names a file the gate can check, so “after refresh” can be claimed done with no test at all.
- “After refresh, done state matches last action” does not say the check survives a full page load after paint. A store-only test can go green while the home screen still paints the stale state.
- The 180ms check-in animation is a design requirement with no observation the Evaluator can assert. Keep it as design guidance.
- Empty state is already an observable criterion (copy plus a create link). No finding there — a later QA fail on that screen is an implementation bug, not a missing criterion.
- The sprint plan does not put a ship bar on sprint 2 (streaks and AI are later). None required on this contract.

## Classification

- Missing `## Acceptance tests`: actionable. Name `app/src/habits.test.ts` and `app/src/check-in.test.ts`, one item per criterion, and write the failing test before the behavior.
- Refresh criterion is observable only in memory: actionable. State a full page load after paint, and cover it from `app/src/check-in.test.ts`.
- Animation timing: trade-off. Leave it under design requirements.
- Empty state already specified: noise relative to this review. The criterion stays.
- Ship bar absent: noise. Sprint 2 is not a ship sprint in this plan.

## Stop

Stop: reviewed

Cross-model: skipped (autonomous)
