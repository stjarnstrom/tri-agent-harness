---
description: Dispatch contract draft, contract review, and the Generator for the current sprint, without ./harness.sh
---

You are in Cursor. Dispatch the build phase so each part runs in its own
isolated context. Do not implement the sprint in this conversation. Do not run
`./harness.sh`.

Find the current sprint N from `docs/sprint-status.md` (the first row that is
not Pass or Skipped). Then ask the orchestrator what the contract still needs:

```bash
node harness-runtime/cli.mjs contract-prep --sprint N
```

Act on the single word it prints. Do each step at most once. Dispatch with the
Task tool, `run_in_background` false, and do not pass `model` unless the user
named a Cursor model slug.

1. `write-contract` — `subagent_type` `generator`, description `Write sprint N contract`.
   Tell it to write `docs/sprint-N-contract.md` only (acceptance criteria,
   `## Acceptance tests`, `## Stack APIs`, and the sprint's ship bar if the
   plan has one). It must not implement and must not mark Ready for QA. Then
   record:
   `node harness-runtime/cli.mjs next-step --record contract-draft --sprint N`
   and run `contract-prep` again.
2. `review` — `subagent_type` `contract-reviewer`, description `Review sprint N contract`.
   Pass the ARTIFACT from
   `node harness-runtime/cli.mjs contract-artifact --sprint N` and point it at
   `docs/sprint-plan.md` and `docs/spec.md`. Do not pass generator reasoning.
   It writes `docs/sprint-N-contract-review.md` and stops. Then record:
   `node harness-runtime/cli.mjs next-step --record contract-review --sprint N`
3. `implement` — `subagent_type` `generator`, description `Build sprint N`.
   Tell it to classify the review findings, implement the sprint, commit as it
   goes, run `bun lint:harness`, write the self-evaluation, and mark the sprint
   "Ready for QA".

The text the user sent with this command is extra context for the implement
prompt (for example `fix the QA failures`).

If `review` was dispatched once and the review file still has no
`Stop: reviewed` line, stop and tell the user. Do not dispatch it again.

When the subagent returns, relay its summary — sprint number, what it built,
known gaps, and lint/status confirmation — and tell the user to run `/qa`.
Do not redo the build in this thread.

To have the whole loop driven for you, use `/cycle`.
