Dispatch the build phase so each part runs in its own isolated context — do
**not** implement the sprint in this conversation yourself.

Find the current sprint N from `docs/sprint-status.md` (the first row that is
not Pass or Skipped). Then ask the orchestrator what the contract still needs:

```bash
node harness-runtime/cli.mjs contract-prep --sprint N
```

Act on the single word it prints. Do each step at most once.

1. `write-contract` — dispatch the `generator` subagent. Tell it to write
   `docs/sprint-N-contract.md` only (acceptance criteria, `## Acceptance tests`,
   `## Stack APIs`, and the sprint's ship bar if the plan has one). It must
   not implement and must not mark Ready for QA. Then record:
   `node harness-runtime/cli.mjs next-step --record contract-draft --sprint N`
   and run `contract-prep` again.
2. `review` — dispatch the `contract-reviewer` subagent. Pass the ARTIFACT from
   `node harness-runtime/cli.mjs contract-artifact --sprint N` and point it at
   `docs/sprint-plan.md` and `docs/spec.md`. Do not pass generator reasoning.
   It writes `docs/sprint-N-contract-review.md` and stops. Then record:
   `node harness-runtime/cli.mjs next-step --record contract-review --sprint N`
3. `implement` — dispatch the `generator` subagent to classify the review
   findings, implement the sprint, commit as it goes, run `bun lint:harness`,
   write the self-evaluation, and mark the sprint "Ready for QA".

Additional context: $ARGUMENTS

If `review` was dispatched once and the review file still has no
`Stop: reviewed` line, stop and tell the user. Do not dispatch it again.

Why a subagent: the Generator builds and a separate Evaluator judges. Running
the generator in its own context (rather than role-playing it here) keeps this
session out of the Evaluator's context, so QA stays independent — the same
isolation the autonomous `./harness.sh` gets by launching each phase as a
separate process. All handoff is through files in `docs/`.

When the subagent returns, relay its summary to me — sprint number, what it
built, known gaps, and lint/status confirmation — and tell me the next step:
run `/qa` to evaluate the sprint. Do not re-do the build work in this thread.

To have the whole loop driven for you instead of stepping phase by phase, use
`/cycle` (the `harness-cycle` skill).
