---
description: Dispatch the Evaluator subagent for the sprint that is Ready for QA, without ./harness.sh
---

You are in Cursor. Dispatch the QA phase to the **evaluator** subagent. Do not
evaluate the sprint in this conversation. Do not run `./harness.sh`.

The mechanical gate runs first. If `docs/sprint-status.md` shows the current
sprint Ready for QA and `node harness-runtime/cli.mjs next-step` prints
`run-pre-qa-gate`, run that printed command in the shell and record the result
before dispatching. Do not skip the gate.

Launch the evaluator with the Task tool:

- `subagent_type`: `evaluator`
- `run_in_background`: false
- `description`: `QA sprint`
- Do not pass `model` unless the user named a Cursor model slug.

Prompt:

> Read `.claude/agents/evaluator.md` and follow its body (ignore that file's
> frontmatter). Read the spec, the sprint contract marked Ready for QA, the
> mechanical-check results, criteria, and review personas. Start the app, test
> every acceptance criterion end-to-end, grade with the weighted formula, write
> `docs/qa-report-sprint-[N].md`, and update `docs/sprint-status.md`.
> Be skeptical; find problems.
>
> Additional context: <the text the user sent with this command, if any>

When the subagent returns, relay PASS/FAIL, the weighted total, any criteria
below threshold, and the top blocking issues. On PASS, the next step is
`/build` for the next sprint. On FAIL, the next step is `/build` with the QA
failures. Do not redo the evaluation in this thread.

To have the loop driven for you, use `/cycle`.
